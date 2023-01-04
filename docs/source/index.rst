.. SODAS GIS documentation master file, created by
   sphinx-quickstart on Thu Dec  1 22:38:51 2022.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

Welcome to SODAS GIS's documentation!
=====================================
본 문서는 SODA+ 시스템의 거버넌스 상호 운용 시스템 (GIS) 의 시스템 구조 및 라이브러리 정보를 포함한다.
SODAS+ 는 오픈 데이터 생태계 구축 플랫폼으로, 생태계에 참여하여 데이터 공유를 지원하는 ``데이터 허브 (DataHub)`` 와
생태계의 관리 감독을 담당하는 ``거버넌스 시스템 (Governance System)`` 으로 구성된다.
그 중에서도 본 문서는 ``거버넌스 시스템`` 이 SODAS+ 의 관리 감독 개체로 참여하는 데이터 허브들에게 데이터허브 탐색을 위한 시드 노드 정보를 제공하고
참조 모델 동기화를 지원하는
**거버넌스 상호운용 시스템 (Governance Inter-operability System, GIS)** 의 구조 및 기능을 소개한다.

.. image:: _static/sodas_echosystem.png
    :alt: SODAS+ 생태계 구성 예시
    :align: center


====================================================================================


.. toctree::
    :maxdepth: 2
    :caption: Introduction

    intro_sodas


.. toctree::
   :maxdepth: 3
   :caption: Modules:

   Daemon
   BootstrapServer
   RMSync
   VersionControl
