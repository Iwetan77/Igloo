# Build: docker build -t igloo-api services/api
# Run:   docker run --env-file services/api/.env -p 8080:8080 igloo-api
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api .

# distroless/static ships CA certificates, needed for Panta, Privy and Supabase TLS.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /api /api
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/api"]
