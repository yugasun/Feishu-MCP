# 使用官方Node.js运行时作为父镜像
FROM docker.1ms.run/node:22.19.0

# 设置工作目录
WORKDIR /app

# 更新 CA 证书，避免 OpenSSL TLS 握手/解密异常
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends ca-certificates openssl && \
    update-ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# 全局安装 pnpm
RUN npm install -g pnpm --registry=https://registry.npmmirror.com

# 复制 package 文件
COPY package*.json ./

# 禁用 prepare 脚本来避免在安装依赖时构建
RUN pnpm install --registry=https://registry.npmmirror.com --ignore-scripts

# 复制源代码
COPY . .

# 手动运行构建步骤
RUN pnpm run build

# 暴露端口
EXPOSE 3333

# 启动命令
CMD ["npm", "start"]