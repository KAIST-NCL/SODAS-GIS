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
WORKDIR /KAIST_SODAS
RUN git checkout September_Test
WORKDIR /KAIST_SODAS/GIS/
RUN npm install
WORKDIR /KAIST_SODAS/GIS/Daemon
ENV DEBUG=sodas:*
RUN git config --global user.email sodas@kaist.ac.kr
RUN git config --global user.name sodas

# 네트워크 관련 수정
RUN sed -i 's/gisIP/sodas.governancesystem/g' ../setting.cfg
RUN sed -i 's/gisKafkaIP/sodas.gs.broker/g' ../setting.cfg
RUN sed -i 's/30092/9094/g' ../setting.cfg

# 기존에 저장되어 있는 referenceModel 삭제
RUN rm -rf /KAIST_SODAS/GIS/reference-model/*