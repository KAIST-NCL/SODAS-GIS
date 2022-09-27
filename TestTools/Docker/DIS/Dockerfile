FROM node:13.14.0

# for model repo
ARG REPO_TOKEN

#
RUN apt-get update
RUN apt install -y make libssl-dev libghc-zlib-dev libcurl4-gnutls-dev libexpat1-dev gettext unzip nano
RUN cd /tmp &&  \
    wget https://github.com/git/git/archive/v2.18.0.tar.gz -O git.tar.gz &&  \
    tar -xf git.tar.gz
RUN cd /tmp/git-* &&  \
    make prefix=/usr/local all &&  \
    make prefix=/usr/local install

RUN echo "trick for docker-build!" && git clone https://$REPO_TOKEN@github.com/EunjuYang/KAIST_SODAS.git
WORKDIR /KAIST_SODAS/DIS/
RUN git checkout September_Test
RUN npm install
WORKDIR /KAIST_SODAS/DIS/Daemon
ENV DEBUG=sodas:*
RUN git config --global user.email sodas@kaist.ac.kr
RUN git config --global user.name sodas

# 네트워크 관련 수정
RUN sed -i 's/gisIP/sodas.governancesystem/g' ../setting.cfg
RUN sed -i 's/myIP/sodas.broker/g' ../setting.cfg
RUN sed -i 's/30092/9093/g' ../setting.cfg