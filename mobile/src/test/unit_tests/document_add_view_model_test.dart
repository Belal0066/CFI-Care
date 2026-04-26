import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart'; // Needed for MethodChannels
import 'package:medflow/presentation/viewmodels/add_document_viewmodel.dart';
import 'package:medflow/utils/enums/type_of_event.dart';
import 'package:medflow/utils/enums/speciality_event.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'document_add_view_model_test.mocks.dart';
import 'dart:io';


@GenerateMocks([ImagePicker, FilePicker])
void main() {
  late DocumentAddViewModel viewModel;
  late MockImagePicker mockImagePicker;
  late MockFilePicker mockFilePicker;

  late Directory testDir;

  // --- MOCKING PATH PROVIDER ---
  // Since Unit Tests run on a computer, not a phone, 'getApplicationDocumentsDirectory'
  // will crash unless we mock the platform channel it uses.
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (MethodCall methodCall) async {
            // Return a dummy path whenever the app asks for a directory
            return testDir.path;
          },
        );
  });

  setUp(() {
    // viewModel = DocumentAddViewModel();
    //INITIALIZE MOCKS
    mockImagePicker = MockImagePicker();
    mockFilePicker = MockFilePicker();

    // INJECT MOCKS INTO VIEWMODEL
    viewModel = DocumentAddViewModel(
      imagePicker: mockImagePicker,
      filePicker: mockFilePicker,
    );
    // Define the parent directory
    final parentDir = Directory('test/temp_artifacts');

    // Create the parent directory if it doesn't exist already
    if (!parentDir.existsSync()) {
      parentDir.createSync(recursive: true);
    }
    
    //create the temp sub-folder
    testDir = parentDir.createTempSync('test_run_');
    // testDir = Directory('test/temp_artifacts').createTempSync('test_run_');

  });

  tearDown(() {
    // 2. Delete the folder and EVERYTHING inside it after the test finishes
    if (testDir.existsSync()) {
      testDir.deleteSync(recursive: true);
    }
  });
  group('DocumentAddViewModel - State Logic', () {
    test('Initial values should be empty/default', () {
      expect(viewModel.title, '');
      expect(viewModel.summary, '');
      expect(viewModel.details, '');
      expect(
        viewModel.isValid,
        false,
      ); // False because title is empty & no file
    });

    test('setTitle updates title and notifies listeners', () {
      bool notified = false;
      viewModel.addListener(() => notified = true);

      viewModel.setTitle('My Medical Record');

      expect(viewModel.title, 'My Medical Record');
      expect(notified, true);
    });

    test('Enums should update correctly', () {
      // 1. Test Type Enum
      viewModel.updateType(TypeOfEventEnum.surgery);
      expect(viewModel.selectedType, TypeOfEventEnum.surgery);

      // 2. Test Speciality Enum
      viewModel.updateSpeciality(SpecialityEventEnum.cardiology);
      expect(viewModel.selectedSpeciality, SpecialityEventEnum.cardiology);
    });

    test('isValid returns true only when Title AND File are present', () {
      // 1. Initial State (Both missing) -> Invalid
      expect(viewModel.isValid, false);

      // 2. Add Title only -> Invalid
      viewModel.setTitle('MRI Scan');
      expect(viewModel.isValid, false);

      // 3. Add File only (simulate file pick) -> Invalid (Title missing, if we cleared it)
      viewModel.setTitle('');
      // We manually set the private variable via a hack or public setter if you had one.
      // Since we can't easily simulate pickPDF without heavy mocking,
      // let's rely on the logic we CAN control.

      // NOTE: Because `filePath` is public, we can set it directly for testing!
      viewModel.filePath = '/dummy/path/file.pdf';
      expect(viewModel.isValid, false); // Title is empty

      // 4. Both present -> Valid
      viewModel.setTitle('MRI Scan');
      expect(viewModel.isValid, true);
    });
  });

  group('DocumentAddViewModel - File Logic', () {
    test('clearFile resets filePath', () {
      // Arrange
      viewModel.filePath = '/some/path.pdf';
      viewModel.isPdf = true;

      // Act
      viewModel.clearFile();

      // Assert
      expect(viewModel.filePath, null);
    });

    test('updateTime updates the TimeOfDay', () {
      const newTime = TimeOfDay(hour: 10, minute: 30);
      viewModel.updateTime(newTime);
      expect(viewModel.selectedTime, newTime);
    });
    test('pickImage updates file path successfully', () async {
      // Arrange: Create a REAL temporary file on computer
      // This satisfies the "existsSync()" check in ViewModel
      // final tempDir = Directory.systemTemp;
      final tempFile = File('${testDir.path}/test_image.jpg');
      // final tempFile = File('${tempDir.path}/test_image.jpg');
      await tempFile.create(); // Actually creates the file on disk

      // Stub: Return the path to that REAL file
      final realFakeFile = XFile(tempFile.path);

      when(
        mockImagePicker.pickImage(source: ImageSource.gallery),
      ).thenAnswer((_) async => realFakeFile);

      // 3. Act
      await viewModel.pickImage();

      // 4. Assert
      expect(viewModel.filePath, isNotNull);
      expect(viewModel.filePath, contains('test_image.jpg'));

      // 5. Cleanup (Delete the temp file)
      await tempFile.delete();
    });
  });
}
