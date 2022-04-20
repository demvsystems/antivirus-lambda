FROM amazonlinux:2 AS layer-image

WORKDIR /home/build

RUN set -e

RUN rm -rf bin && \
    rm -rf lib

RUN yum update -y && amazon-linux-extras install epel -y && yum install -y \
    cpio \
    yum-utils \
    tar.x86_64 \
    gzip \
    zip \
    shadow-utils.x86_64 && \
    yum clean all && \
    rm -rf /var/cache/yum

RUN yumdownloader -x \*i686 --archlist=x86_64 \
    clamav \
    clamav-scanner-systemd \
    clamav-lib \
    clamav-update \
    json-c \
    pcre2 \
    libtool-ltdl \
    libxml2 \
    bzip2-libs \
    xz-libs \
    libprelude \
    gnutls \
    nettle \
    systemd-libs \
    elfutils-libs \
    lz4

RUN rpm2cpio clamav-0*.rpm | cpio -vimd
RUN rpm2cpio clamd-0*.rpm | cpio -vimd
RUN rpm2cpio clamav-lib*.rpm | cpio -vimd
RUN rpm2cpio clamav-update*.rpm | cpio -vimd
RUN rpm2cpio json-c*.rpm | cpio -vimd
RUN rpm2cpio pcre*.rpm | cpio -vimd
RUN rpm2cpio libtool-ltdl*.rpm | cpio -vimd
RUN rpm2cpio libxml2*.rpm | cpio -vimd
RUN rpm2cpio bzip2-libs*.rpm | cpio -vimd
RUN rpm2cpio xz-libs*.rpm | cpio -vimd
RUN rpm2cpio libprelude*.rpm | cpio -vimd
RUN rpm2cpio gnutls*.rpm | cpio -vimd
RUN rpm2cpio nettle*.rpm | cpio -vimd
RUN rpm2cpio systemd-libs*.rpm | cpio -vimd
RUN rpm2cpio elfutils-libs*.rpm | cpio -idmv
RUN rpm2cpio lz4*.rpm | cpio -idmv
RUN rm -rf *.rpm

RUN mkdir -p bin && \
    mkdir -p lib && \
    mkdir -p var/lib/clamav && \
    chmod -R 777 var/lib/clamav

COPY ./freshclam.conf ./bin/freshclam.conf
COPY ./clamd.conf ./bin/scan.conf

RUN cp usr/bin/clamscan usr/bin/clamdscan usr/bin/freshclam bin/. && \
    cp -r usr/lib64/* lib/.

RUN groupadd clamav && \
    useradd -g clamav -s /bin/false -c "Clam Antivirus" clamav && \
    useradd -g clamav -s /bin/false -c "Clam Antivirus" clamupdate

FROM public.ecr.aws/lambda/nodejs:14

COPY --from=layer-image /home/build ./

COPY dist/handler.js ./

CMD ["handler.virusScan"]
