package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9_.]{3,20}$`)

const (
	maxBio         = 160
	maxDisplayName = 50
	avatarBucket   = "avatars"
)

var profileLimits = []window{{10, time.Minute}, {100, 24 * time.Hour}}

// updateMe edits the caller's profile. Omitted fields are unchanged; ""
// clears display_name, bio or avatar_url. Usernames are lowercased and can
// be changed but not cleared.
func (s *Server) updateMe(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Username    *string `json:"username"`
		DisplayName *string `json:"display_name"`
		Bio         *string `json:"bio"`
		AvatarURL   *string `json:"avatar_url"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	upd := store.ProfileUpdate{}
	if in.Username != nil {
		name := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(*in.Username), "@")))
		if !usernamePattern.MatchString(name) {
			writeError(w, http.StatusBadRequest, "INVALID_USERNAME", "3-20 characters: a-z, 0-9, _ and .")
			return
		}
		upd.Username = &name
	}
	if in.DisplayName != nil {
		d := strings.TrimSpace(*in.DisplayName)
		if utf8.RuneCountInString(d) > maxDisplayName {
			writeError(w, http.StatusBadRequest, "INVALID_DISPLAY_NAME", "display_name is at most 50 characters")
			return
		}
		upd.DisplayName = &d
	}
	if in.Bio != nil {
		b := strings.TrimSpace(*in.Bio)
		if utf8.RuneCountInString(b) > maxBio {
			writeError(w, http.StatusBadRequest, "INVALID_BIO", "bio is at most 160 characters")
			return
		}
		upd.Bio = &b
	}
	if in.AvatarURL != nil {
		a := strings.TrimSpace(*in.AvatarURL)
		// Only images uploaded through /uploads/avatar into the caller's own
		// folder, so profiles can't hotlink or claim someone else's upload.
		if a != "" && (s.storage == nil || !strings.HasPrefix(a, s.storage.PublicURL(avatarBucket, u.ID+"/"))) {
			writeError(w, http.StatusBadRequest, "INVALID_AVATAR_URL", "avatar_url must come from POST /uploads/avatar")
			return
		}
		upd.AvatarURL = &a
	}
	if !s.limit(w, r, "profile", u.ID, profileLimits) {
		return
	}
	switch err := s.store.UpdateProfile(r.Context(), u.ID, upd); {
	case errors.Is(err, store.ErrUsernameTaken):
		writeError(w, http.StatusConflict, "USERNAME_TAKEN", "")
		return
	case err != nil:
		s.internal(w, r, err)
		return
	}
	s.me(w, r, u)
}

var avatarExt = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

var avatarLimits = []window{{5, 10 * time.Minute}, {20, 24 * time.Hour}}

func (s *Server) uploadAvatar(w http.ResponseWriter, r *http.Request, u store.User) {
	if s.storage == nil {
		writeError(w, http.StatusServiceUnavailable, "UPLOADS_NOT_CONFIGURED", "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set")
		return
	}
	var in struct {
		ContentType string `json:"content_type"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	ext, ok := avatarExt[in.ContentType]
	if !ok {
		writeError(w, http.StatusBadRequest, "UNSUPPORTED_MEDIA_TYPE", "content_type must be image/jpeg, image/png or image/webp")
		return
	}
	if !s.limit(w, r, "avatar", u.ID, avatarLimits) {
		return
	}
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	up, err := s.storage.SignUpload(r.Context(), avatarBucket, u.ID+"/"+hex.EncodeToString(b)+"."+ext)
	if err != nil {
		s.log.Error("sign avatar upload", "err", err)
		writeError(w, http.StatusBadGateway, "STORAGE_UNAVAILABLE", "could not create an upload URL")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"path": up.Path, "token": up.Token, "upload_url": up.UploadURL, "public_url": up.PublicURL,
	})
}

func (s *Server) userByUsername(w http.ResponseWriter, r *http.Request) {
	viewer, ok := s.viewerID(w, r)
	if !ok {
		return
	}
	name := strings.ToLower(strings.TrimPrefix(r.PathValue("username"), "@"))
	if !usernamePattern.MatchString(name) {
		writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "")
		return
	}
	p, err := s.store.ProfileByUsername(r.Context(), viewer, name)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "")
		return
	}
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toProfileOut(p))
}

// myLiked lists posts the caller liked (newest post first). Private to the caller.
func (s *Server) myLiked(w http.ResponseWriter, r *http.Request, u store.User) {
	limit, ok := parseLimit(w, r.URL.Query().Get("limit"))
	if !ok {
		return
	}
	s.chronoFeed(w, r, store.FeedQuery{ViewerID: u.ID, LikedBy: u.ID, Limit: limit})
}
