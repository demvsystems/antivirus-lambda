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

RUN for p in \
    clamav-0*.rpm \
    clamd-0*.rpm \
    clamav-lib*.rpm \
    clamav-update*.rpm \
    json-c*.rpm \
    pcre*.rpm \
    libtool-ltdl*.rpm \
    libxml2*.rpm \
    bzip2-libs*.rpm \
    xz-libs*.rpm \
    libprelude*.rpm \
    gnutls*.rpm \
    nettle*.rpm \
    systemd-libs*.rpm \
    elfutils-libs*.rpm \
    lz4*.rpm \
    ; do rpm2cpio "$p" | cpio -vimd; done && \
    rm -rf *.rpm

RUN mkdir -p bin && \
    mkdir -p lib && \
    mkdir -p var/lib/clamav && \
    chmod -R 777 var/lib/clamav

COPY ./freshclam.conf ./bin/freshclam.conf
COPY ./clamd.conf ./bin/scan.conf

RUN cp usr/bin/clamscan \
    usr/bin/clamdscan \
    usr/sbin/clamd \
    usr/bin/freshclam bin/. && \
    cp -r usr/lib64/* lib/.

RUN groupadd clamav && \
    useradd -g clamav -s /bin/false -c "Clam Antivirus" clamav && \
    useradd -g clamav -s /bin/false -c "Clam Antivirus" clamupdate

FROM public.ecr.aws/lambda/nodejs:14

COPY --from=layer-image /home/build ./

COPY dist/handler.js dist/clamAvService.js dist/virusScan.js dist/utils.js ./

CMD ["handler.virusScan"]
