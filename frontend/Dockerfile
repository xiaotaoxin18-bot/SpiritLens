FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 构建时传入 API 地址，默认用相对路径（子路径部署）
ARG NEXT_PUBLIC_API_URL=/spiritlens
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
