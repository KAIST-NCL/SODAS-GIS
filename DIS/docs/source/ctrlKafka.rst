ctrlKafka
======================================

:Authors:
    | Eunju Yang (yejyang@kaist.ac.kr)
    | Jeongwon Lee (korjw1@kaist.ac.kr)

:Version: 3.0.0 of 2022.11.30


ctrlKafka 모듈은 DISDaemon과 data map 관리 시스템 사이의 통신을 위한 Kafka 라이브러리를 포함한다.
약속된 DISDaemon이 통신하기위한 ``ctrlConsumer`` 와 ``ctrlProducer`` 모듈을 포함한다.

======================================

*******
ctrlConsumer
*******

.. js:autoclass:: ctrlConsumer
   :members:

.. js:autofunction:: eventSwitch
.. js:autofunction:: onMessage


======================================

*******
ctrlProducer
*******

.. js:autoclass:: ctrlProducer
    :members:

.. js:autofunction:: createCtrlTopics
