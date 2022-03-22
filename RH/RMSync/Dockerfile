FROM node:13.14.0

# for model repo
ARG REPO_TOKEN

#
RUN apt-get update
RUN apt-get install -y git

RUN git clone https://$REPO_TOKEN@github.com/EunjuYang/KAIST_SODAS.git
WORKDIR /KAIST_SODAS
RUN git checkout dh_daemon
WORKDIR /KAIST_SODAS/RH/
RUN npm install
WORKDIR /KAIST_SODAS/RH/RMSync
ENV DEBUG=sodas:*
ENTRYPOINT ["node", "rmSessionManager.js"]