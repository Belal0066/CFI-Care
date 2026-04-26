import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:medflow/presentation/viewmodels/major_event_provider.dart'; 
import 'package:medflow/domain/repository/major_event_repo.dart';
import 'package:medflow/domain/models/major_event.dart';
import 'package:medflow/domain/models/event_node.dart'; 

// Generate Mock for the Repository
//flutter pub run build_runner build
@GenerateMocks([MajorEventRepository])
import 'major_event_provider_test.mocks.dart';

void main() {
  late MajorEventProvider provider;
  late MockMajorEventRepository mockRepo;

  setUp(() {
    mockRepo = MockMajorEventRepository();
    provider = MajorEventProvider(mockRepo);
  });

  // --- Dummy Data ---
  MajorEvent createDummyEvent() {
    return MajorEvent(
      id: '1', 
      title: 'Surgery', 
      status: 'PLANNED', // Matches your String status
    );
  }
      
  EventNode createDummyNode() {
    return EventNode(
      id: 'n1', 
      title: 'Pre-op', 
      date: '2025-01-20', // Matches your String date
      details: 'Patient vitals checked',
      documentUrl: 'http://example.com/doc.pdf',
    );
  }
  group('MajorEventProvider - fetchEvents', () {
    test('fetchEvents success updates list and loading state', () async {
      // Arrange
      final dummyEvents = [createDummyEvent(), createDummyEvent()];
      
      // Stub: Return a list of events immediately
      when(mockRepo.getMajorEvents())
          .thenAnswer((_) async => dummyEvents);

      // Act
      // We start the future but don't await it immediately to check the 'loading=true' state
      final future = provider.fetchEvents();
      
      // Assert 1: Loading should be true right after calling
      expect(provider.isLoadingEvents, true);

      // Act 2: Wait for it to finish
      await future;

      // Assert 2: Loading is false, data is populated
      expect(provider.isLoadingEvents, false);
      expect(provider.events.length, 2);
      expect(provider.events.first.title, 'Surgery');
    });

    test('fetchEvents handles error gracefully', () async {
      // Arrange: Throw an error
      when(mockRepo.getMajorEvents())
          .thenThrow(Exception('Network Error'));

      // Act
      await provider.fetchEvents();

      // Assert
      expect(provider.isLoadingEvents, false); // Should still turn off loading
      expect(provider.events, isEmpty); // List remains empty
    });
  });

  group('MajorEventProvider - fetchNodes', () {
    test('fetchNodes success clears previous nodes and loads new ones', () async {
      // Arrange
      final dummyNodes = [createDummyNode()];
      when(mockRepo.getNodesForEvent('1'))
          .thenAnswer((_) async => dummyNodes);

      // Act
      await provider.fetchNodes('1');

      // Assert
      expect(provider.isLoadingNodes, false);
      expect(provider.nodes.length, 1);
      expect(provider.nodes.first.title, 'Pre-op');
    });

    test('fetchNodes clears old data before fetching', () async {
      // Arrange: Load some initial nodes manually
      // We can't set _nodes directly because it's private, but we can mock a first call
      when(mockRepo.getNodesForEvent('1')).thenAnswer((_) async => [createDummyNode()]);
      await provider.fetchNodes('1');
      expect(provider.nodes, isNotEmpty); // Pre-check

      // Now set up a DELAYED response for the second call
      when(mockRepo.getNodesForEvent('2'))
          .thenAnswer((_) async {
            await Future.delayed(const Duration(milliseconds: 50));
            return [];
          });

      // Act: Fetch new nodes
      final future = provider.fetchNodes('2');

      // Assert: Immediately after calling, nodes should be cleared (empty)
      expect(provider.nodes, isEmpty);
      await future;
    });
  });
}