FROM nginxinc/nginx-unprivileged:1.30.0-alpine
COPY dist/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
