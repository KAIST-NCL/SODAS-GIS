FROM node:13.14.0

# for model repo
ARG REPO_TOKEN

#
RUN apt-get update
RUN apt-get install -y git

RUN git clone https://$REPO_TOKEN@github.com/EunjuYang/KAIST_SODAS.git
WORKDIR /KAIST_SODAS/DH/
RUN npm install
WORKDIR /KAIST_SODAS/DH/Daemon
ENV DEBUG=sodas:*
ENTRYPOINT ["node", "DHDaemon.js"]