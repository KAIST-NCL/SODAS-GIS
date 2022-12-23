.. _VersionControlModule:

VersionControl
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | Ji-Hwan Kim (j.h_kim@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)
:Version: 3.0.0 of 2022.11.30

VersionControl 모듈은 SODAS+ GIS :ref:`gsDaemon`에 의해 실행되는 모듈로, :ref:`vcConsumer`를 통해 수신한 send.referenceModel 및 send.dictionary 토픽의 Kafka 메시지를 처리하고 referenceModel 및 dictionary 버전을 관리하며 이를 통해 이들의 증분 데이터를 추출하는 역할을 수행한다.

VersionControl 모듈은 send.referenceModel 및 send.dictionary 토픽의 Kafka 메시지를 수신하는 :ref:`vcConsumer`, 저장소 및 referenceModel, dictionary 버전을 관리하는 :ref:`versionController`, 그리고 이를 총괄하는 :ref:`vcModule`로 구성된다.

|

.. toctree::
    :maxdepth: 1
    :caption: SubModules:

    _VCModule
    _VCConsumer
    _VersionController