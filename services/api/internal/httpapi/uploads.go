package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

const videoBucket = "videos"

var videoExt = map[string]string{
	"video/mp4":       "mp4",
	"video/webm":      "webm",
	"video/quicktime": "mov",
}

// uploadVideo hands the signed-in user a one-time signed URL for a new object
// in the public "videos" bucket. Objects are namespaced by user id.
func (s *Server) uploadVideo(w http.ResponseWriter, r *http.Request, u store.User) {
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
	ext, ok := videoExt[in.ContentType]
	if !ok {
		writeError(w, http.StatusBadRequest, "UNSUPPORTED_MEDIA_TYPE", "content_type must be video/mp4, video/webm or video/quicktime")
		return
	}
	if !s.limit(w, "upload", u.ID, uploadLimits) {
		return
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	up, err := s.storage.SignUpload(r.Context(), videoBucket, u.ID+"/"+hex.EncodeToString(b)+"."+ext)
	if err != nil {
		s.log.Error("sign upload", "err", err)
		writeError(w, http.StatusBadGateway, "STORAGE_UNAVAILABLE", "could not create an upload URL")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"path":       up.Path,
		"token":      up.Token,
		"upload_url": up.UploadURL,
		"public_url": up.PublicURL,
	})
}
