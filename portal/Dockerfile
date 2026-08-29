FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY portal/index.html /usr/share/nginx/html/index.html
COPY README.md /usr/share/nginx/html/docs/root-readme.md
COPY assignment-1 /usr/share/nginx/html/docs/assignment-1
COPY assignment-2 /usr/share/nginx/html/docs/assignment-2

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
