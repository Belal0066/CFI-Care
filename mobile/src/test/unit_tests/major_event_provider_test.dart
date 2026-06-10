import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:medflow/presentation/viewmodels/major_event_provider.dart';
import 'package:medflow/domain/repository/major_event_repo.dart';
import 'package:medflow/domain/models/major_event.dart';
import 'package:medflow/domain/models/event_node.dart';
import 'package:medflow/database/db_helper.dart';

@GenerateMocks([MajorEventRepository])
import 'major_event_provider_test.mocks.dart';

void main() {
  late MajorEventProvider provider;
  late MockMajorEventRepository mockRepo;

  setUp(() {
    mockRepo = MockMajorEventRepository();
    provider = MajorEventProvider(mockRepo);
    Session.currentUserId = 'patient-1';
  });

  tearDown(() {
    Session.currentUserId = null;
  });

  MajorEvent createDummyEvent() => MajorEvent(
        id: '1',
        title: 'Surgery',
        status: 'PLANNED',
      );

  EventNode createDummyNode() => EventNode(
        id: 'n1',
        title: 'Pre-op',
        date: '2025-01-20',
        details: 'Patient vitals checked',
        documentUrl: 'http://example.com/doc.pdf',
      );

  group('MajorEventProvider - fetchEvents', () {
    test('fetchEvents success updates list and loading state', () async {
      final dummyEvents = [createDummyEvent(), createDummyEvent()];

      when(mockRepo.getMajorEvents(any)).thenAnswer((_) async => dummyEvents);

      final future = provider.fetchEvents();
      expect(provider.isLoadingEvents, true);
      await future;

      expect(provider.isLoadingEvents, false);
      expect(provider.events.length, 2);
      expect(provider.events.first.title, 'Surgery');
    });

    test('fetchEvents handles error gracefully', () async {
      when(mockRepo.getMajorEvents(any)).thenThrow(Exception('Network Error'));

      await provider.fetchEvents();

      expect(provider.isLoadingEvents, false);
      expect(provider.events, isEmpty);
    });

    test('fetchEvents does nothing when no patient session', () async {
      Session.currentUserId = null;

      await provider.fetchEvents();

      verifyNever(mockRepo.getMajorEvents(any));
      expect(provider.events, isEmpty);
      expect(provider.eventsError, isNotNull);
    });
  });

  group('MajorEventProvider - fetchNodes', () {
    test('fetchNodes success clears previous nodes and loads new ones',
        () async {
      final dummyNodes = [createDummyNode()];
      when(mockRepo.getNodesForEvent(any, any))
          .thenAnswer((_) async => dummyNodes);

      await provider.fetchNodes('1');

      expect(provider.isLoadingNodes, false);
      expect(provider.nodes.length, 1);
      expect(provider.nodes.first.title, 'Pre-op');
    });

    test('fetchNodes clears old data before fetching', () async {
      when(mockRepo.getNodesForEvent(any, any))
          .thenAnswer((_) async => [createDummyNode()]);
      await provider.fetchNodes('1');
      expect(provider.nodes, isNotEmpty);

      when(mockRepo.getNodesForEvent(any, any)).thenAnswer((_) async {
        await Future.delayed(const Duration(milliseconds: 50));
        return [];
      });

      final future = provider.fetchNodes('2');
      expect(provider.nodes, isEmpty);
      await future;
    });

    test('fetchNodes does nothing when no patient session', () async {
      Session.currentUserId = null;

      await provider.fetchNodes('1');

      verifyNever(mockRepo.getNodesForEvent(any, any));
      expect(provider.nodes, isEmpty);
    });
  });
}
