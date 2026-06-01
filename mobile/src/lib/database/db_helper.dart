import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:flutter/material.dart';
import '../domain/models/created_events.dart';
import '../domain/models/document.dart';
import '../utils/enums/type_of_event.dart';
import '../utils/enums/speciality_event.dart';

// class Session {
//   static String? currentUserId;
// }

class Session {
  static String? currentUserId;
  // Always the Keycloak JWT sub — used for backend API calls where the server
  // checks reqId (claims.sub) === patientId. May differ from currentUserId for
  // legacy accounts that were created before Keycloak integration.
  static String? fhirPatientId;
}

class DBHelper {
  static Database? _db;
  static const _dbName = 'medflow.db';
  static const _version = 5;

  static Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDb();
    return _db!;
  }

  static Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _dbName);
    return await openDatabase(
      path,
      version: _version,
      onCreate: _createDb,
      onUpgrade: _onUpgrade,
    );
  }

  static Future<void> _onUpgrade(
    Database db,
    int oldVersion,
    int newVersion,
  ) async {
    if (oldVersion < 2) {
      try {
        await db.execute(
          'ALTER TABLE documents ADD COLUMN isSynced INTEGER DEFAULT 0',
        );
      } catch (_) {}
      try {
        await db.execute('ALTER TABLE documents ADD COLUMN serverId TEXT');
      } catch (_) {}
    }

    if (oldVersion < 3) {
      try {
        await db.execute(
          "ALTER TABLE documents ADD COLUMN syncStatus TEXT DEFAULT 'pending'",
        );
      } catch (_) {}
      try {
        await db.execute(
          'ALTER TABLE documents ADD COLUMN retryCount INTEGER DEFAULT 0',
        );
      } catch (_) {}
      try {
        await db.execute('ALTER TABLE documents ADD COLUMN lastError TEXT');
      } catch (_) {}
      try {
        await db.execute('ALTER TABLE documents ADD COLUMN nextAttemptAt TEXT');
      } catch (_) {}
    }

    if (oldVersion < 4) {
      try {
        await db.execute('ALTER TABLE documents ADD COLUMN jobId TEXT');
      } catch (_) {}
    }

    if (oldVersion < 5) {
      try {
        await db.execute('ALTER TABLE documents ADD COLUMN progress REAL DEFAULT 0.0');
      } catch (_) {}
      try {
        await db.execute('ALTER TABLE documents ADD COLUMN jobState TEXT');
      } catch (_) {}
    }
  }

  static Future<void> _createDb(Database db, int version) async {
    // 1. Users
    await db.execute('''
      CREATE TABLE users (
        userId TEXT PRIMARY KEY,
        email TEXT NOT NULL
      )
    ''');
    // password TEXT NOT NULL

    // 2. Events
    await db.execute("""
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT,
      summary TEXT, 
      details TEXT,
      attachmentPath TEXT,
      date TEXT,
      time TEXT,
      type INTEGER,
      speciality INTEGER,
      FOREIGN KEY(userId) REFERENCES users(userId)
    )
    """);

    // 3. Profile
    await db.execute('''
      CREATE TABLE user_profile (
        userId TEXT PRIMARY KEY,
        firstName TEXT,
        lastName TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        dob TEXT,
        gender TEXT,
        bloodType TEXT,
        height TEXT,
        weight TEXT,
        allergies TEXT,
        conditions TEXT,
        medications TEXT,
        geneticConditions TEXT,
        chronicDiseases TEXT,
        emergencyContact TEXT,
        insuranceProvider TEXT,
        policyNumber TEXT,
        FOREIGN KEY(userId) REFERENCES users(userId)
      )
    ''');

    // 4. Documents Table
    await db.execute("""
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT,
      filePath TEXT,
      isPDF INTEGER,
      summary TEXT,
      details TEXT,
      type INTEGER,
      speciality INTEGER,
      time TEXT,
      isSynced INTEGER DEFAULT 0,
      serverId TEXT,
      jobId TEXT,
      syncStatus TEXT DEFAULT 'pending',
      retryCount INTEGER DEFAULT 0,
      lastError TEXT,
      nextAttemptAt TEXT,
      progress REAL DEFAULT 0.0,
      jobState TEXT,
      FOREIGN KEY(userId) REFERENCES users(userId)
    )
    """);
  }

  static Future<void> debugPrintAllTables() async {
    final db = await database;
    print('\n================ DOCUMENTS TABLE ================');
    final docs = await db.query('documents');
    for (var row in docs) {
      print(row);
    }
    print('================================================\n');
  }

  // ---------- Users & Auth ----------
  static Future<int> insertUser({
    required String userId,
    required String email,
    // required String password,
  }) async {
    final db = await database;
    return await db.insert('users', {
      'userId': userId,
      'email': email,
      // 'password': password,
    }, conflictAlgorithm: ConflictAlgorithm.abort);
  }

  static Future<String?> validateUser(String email, String password) async {
    final db = await database;
    final res = await db.query(
      'users',
      where: 'email = ?',
      whereArgs: [email],
      limit: 1,
    );
    if (res.isNotEmpty) return res.first['userId'] as String;
    return null;
  }

  static Future<bool> emailExists(String email) async {
    final db = await database;
    final res = await db.query(
      'users',
      where: 'email = ?',
      whereArgs: [email],
      limit: 1,
    );
    return res.isNotEmpty;
  }

  // ---------- Profile ----------
  static Future<int> upsertProfile(
    String userId,
    Map<String, dynamic> data,
  ) async {
    final db = await database;
    data['userId'] = userId;
    return await db.insert(
      'user_profile',
      data,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<Map<String, dynamic>?> getUserProfile(String userId) async {
    final db = await database;
    final maps = await db.query(
      'user_profile',
      where: 'userId = ?',
      whereArgs: [userId],
    );
    return maps.isNotEmpty ? maps.first : null;
  }

  // ... EVENT METHODS ...
  static Future<int> insertEvent(
    String userId,
    Event event,
    DateTime date,
  ) async {
    final db = await DBHelper.database;
    final id = event.id ?? DateTime.now().millisecondsSinceEpoch.toString();
    return await db.insert('events', {
      'id': id,
      'userId': userId,
      'title': event.title,
      'summary': event.summary,
      'details': event.details,
      'attachmentPath': event.attachmentPath,
      'date': date.toIso8601String(),
      'time': '${event.time.hour}:${event.time.minute}',
      'type': event.selectedTypeOfEventEnum.index,
      'speciality': event.selectedSpecialityEnum.index,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<Map<DateTime, List<Event>>> getAllEventsForUser(
    String userId,
  ) async {
    final db = await database;
    final rows = await db.query(
      'events',
      where: 'userId = ?',
      whereArgs: [userId],
      orderBy: 'date ASC, time ASC',
    );
    final Map<DateTime, List<Event>> result = {};
    for (final row in rows) {
      try {
        final date = DateTime.parse(row['date'] as String);
        final key = DateTime(date.year, date.month, date.day);
        final timeParts = (row['time'] as String).split(':');
        final event = Event(
          title: row['title'] as String? ?? '',
          id: row['id'].toString(),
          summary: row['summary'] as String? ?? '',
          details: row['details'] as String? ?? '',
          attachmentPath: row['attachmentPath'] as String?,
          selectedTypeOfEventEnum:
              TypeOfEventEnum.values[_parseEnumIndex(row['type'], 0)],
          selectedSpecialityEnum:
              SpecialityEventEnum.values[_parseEnumIndex(row['speciality'], 0)],
          time: TimeOfDay(
            hour: int.parse(timeParts[0]),
            minute: int.parse(timeParts[1]),
          ),
        );
        result.putIfAbsent(key, () => []).add(event);
      } catch (e) {
        print('Error parsing event: $e');
      }
    }
    return result;
  }

  static Future<int> deleteEvent(String eventId) async {
    final db = await database;
    return await db.delete('events', where: 'id = ?', whereArgs: [eventId]);
  }

  // ---------- Documents Methods ----------

  static Future<int> insertDocument(String userId, DocumentModel doc) async {
    final db = await database;
    final id = doc.id ?? DateTime.now().millisecondsSinceEpoch.toString();

    return await db.insert('documents', {
      'id': id,
      'userId': userId,
      'title': doc.title,
      'filePath': doc.filePath,
      'isPDF': doc.isPDF ? 1 : 0,
      'summary': doc.summary,
      'details': doc.details,
      'type': doc.type.index,
      'speciality': doc.speciality.index,
      'time': '${doc.time.hour}:${doc.time.minute}',
      'isSynced': doc.isSynced ? 1 : 0,
      'serverId': doc.serverId,
      'jobId': doc.jobId,
      'syncStatus': doc.isSynced ? 'synced' : 'pending',
      'retryCount': 0,
      'lastError': null,
      'nextAttemptAt': null,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<List<DocumentModel>> getPendingDocumentsForSync(
    String userId,
  ) async {
    final db = await database;
    final nowIso = DateTime.now().toUtc().toIso8601String();

    final rows = await db.query(
      'documents',
      where:
          "userId = ? AND isSynced = 0 AND syncStatus != 'user_retry_needed' AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)",
      whereArgs: [userId, nowIso],
      orderBy: 'id ASC',
    );

    return rows.map((row) {
      final timeParts = (row['time'] as String).split(':');
      return DocumentModel(
        id: row['id'] as String,
        serverId: row['serverId'] as String?,
        jobId: row['jobId'] as String?,
        title: row['title'] as String,
        filePath: row['filePath'] as String,
        isPDF: (row['isPDF'] as int) == 1,
        summary: row['summary'] as String,
        details: row['details'] as String,
        type: TypeOfEventEnum.values[_parseEnumIndex(row['type'], 0)],
        speciality:
            SpecialityEventEnum.values[_parseEnumIndex(row['speciality'], 0)],
        time: TimeOfDay(
          hour: int.parse(timeParts[0]),
          minute: int.parse(timeParts[1]),
        ),
        isSynced: false,
        syncStatus: (row['syncStatus'] as String?) ?? 'pending',
        progress: (row['progress'] as num?)?.toDouble() ?? 0.0,
        jobState: row['jobState'] as String?,
        lastError: row['lastError'] as String?,
        retryCount: _parseEnumIndex(row['retryCount'], 0),
      );
    }).toList();
  }

  static Future<int> markDocumentJobSubmitted({
    required String documentId,
    required String jobId,
  }) async {
    final db = await database;
    return await db.update(
      'documents',
      {
        'jobId': jobId,
        'syncStatus': 'job_submitted',
        'isSynced': 0,
        'retryCount': 0,
        'lastError': null,
        'nextAttemptAt': null,
        'progress': 0.0,
        'jobState': 'PENDING',
      },
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> updateDocumentProgress({
    required String documentId,
    required double progress,
    required String jobState,
  }) async {
    final db = await database;
    return await db.update(
      'documents',
      {'progress': progress, 'jobState': jobState},
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> resetDocumentForAutoRetry(String documentId) async {
    final db = await database;
    final rows = await db.query(
      'documents',
      columns: ['retryCount'],
      where: 'id = ?',
      whereArgs: [documentId],
      limit: 1,
    );
    final current = rows.isNotEmpty ? _parseEnumIndex(rows.first['retryCount'], 0) : 0;
    return await db.update(
      'documents',
      {
        'jobId': null,
        'syncStatus': 'pending',
        'isSynced': 0,
        'retryCount': current + 1,
        'lastError': null,
        'nextAttemptAt': null,
        'progress': 0.0,
        'jobState': null,
      },
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> markNeedsUserRetry({
    required String documentId,
    required String error,
  }) async {
    final db = await database;
    return await db.update(
      'documents',
      {
        'syncStatus': 'user_retry_needed',
        'jobState': 'FAILED',
        'lastError': error,
        'isSynced': 0,
      },
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> resetDocumentForManualRetry(String documentId) async {
    final db = await database;
    return await db.update(
      'documents',
      {
        'jobId': null,
        'syncStatus': 'pending',
        'isSynced': 0,
        'retryCount': 0,
        'lastError': null,
        'nextAttemptAt': null,
        'progress': 0.0,
        'jobState': null,
      },
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> markDocumentSyncInProgress(String documentId) async {
    final db = await database;
    return await db.update(
      'documents',
      {'syncStatus': 'syncing', 'lastError': null},
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> markDocumentSyncSuccess({
    required String documentId,
    required String serverId,
    String? summary,
  }) async {
    final db = await database;
    final values = <String, dynamic>{
      'isSynced': 1,
      'serverId': serverId,
      'syncStatus': 'synced',
      'retryCount': 0,
      'lastError': null,
      'nextAttemptAt': null,
    };
    if (summary != null && summary.isNotEmpty) {
      values['summary'] = summary;
    }
    return await db.update(
      'documents',
      values,
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static Future<int> markDocumentSyncFailure({
    required String documentId,
    required String error,
  }) async {
    final db = await database;

    final rows = await db.query(
      'documents',
      columns: ['retryCount'],
      where: 'id = ?',
      whereArgs: [documentId],
      limit: 1,
    );

    final currentRetry = rows.isNotEmpty
        ? _parseEnumIndex(rows.first['retryCount'], 0)
        : 0;
    final nextRetry = currentRetry + 1;

    final backoffSeconds = _computeBackoffSeconds(nextRetry);
    final nextAttempt = DateTime.now()
        .toUtc()
        .add(Duration(seconds: backoffSeconds))
        .toIso8601String();

    return await db.update(
      'documents',
      {
        'isSynced': 0,
        'syncStatus': 'failed',
        'retryCount': nextRetry,
        'lastError': error,
        'nextAttemptAt': nextAttempt,
      },
      where: 'id = ?',
      whereArgs: [documentId],
    );
  }

  static int _computeBackoffSeconds(int retry) {
    final cappedRetry = retry > 7 ? 7 : retry;
    final seconds = 15 * (1 << cappedRetry);
    return seconds > 3600 ? 3600 : seconds;
  }

  static Future<List<DocumentModel>> getDocumentsForUser(String userId) async {
    final db = await database;
    final rows = await db.query(
      'documents',
      where: 'userId = ?',
      whereArgs: [userId],
      orderBy: 'id DESC',
    );

    return rows.map((row) {
      final timeParts = (row['time'] as String).split(':');
      return DocumentModel(
        id: row['id'] as String,
        serverId: row['serverId'] as String?,
        jobId: row['jobId'] as String?,
        title: row['title'] as String,
        filePath: row['filePath'] as String,
        isPDF: (row['isPDF'] as int) == 1,
        summary: row['summary'] as String,
        details: row['details'] as String,
        type: TypeOfEventEnum.values[_parseEnumIndex(row['type'], 0)],
        speciality:
            SpecialityEventEnum.values[_parseEnumIndex(row['speciality'], 0)],
        time: TimeOfDay(
          hour: int.parse(timeParts[0]),
          minute: int.parse(timeParts[1]),
        ),
        isSynced: _parseEnumIndex(row['isSynced'], 0) == 1,
        syncStatus: (row['syncStatus'] as String?) ?? 'pending',
        progress: (row['progress'] as num?)?.toDouble() ?? 0.0,
        jobState: row['jobState'] as String?,
        lastError: row['lastError'] as String?,
        retryCount: _parseEnumIndex(row['retryCount'], 0),
      );
    }).toList();
  }

  static Future<int> deleteDocument(String docId) async {
    final db = await database;
    return await db.delete('documents', where: 'id = ?', whereArgs: [docId]);
  }

  static int _parseEnumIndex(dynamic value, int fallbackIndex) {
    if (value is int) return value;
    if (value is String) return int.tryParse(value) ?? fallbackIndex;
    return fallbackIndex;
  }

  static Future<int> updateDocument(DocumentModel doc) async {
    final db = await database;
    return await db.update(
      'documents',
      {
        'isSynced': doc.isSynced ? 1 : 0,
        'serverId': doc.serverId,
        'syncStatus': doc.isSynced ? 'synced' : 'pending',
        'retryCount': doc.isSynced ? 0 : 0,
        'lastError': null,
        'nextAttemptAt': null,
        // You can update other fields here if needed (e.g. title, summary)
      },
      where: 'id = ?',
      whereArgs: [doc.id],
    );
  }


  static Future<String?> findUserIdByEmail(String email) async {
  final db = await database;
  final res = await db.query(
    'users',
    columns: ['userId'],
    where: 'email = ?',
    whereArgs: [email],
    limit: 1,
  );
  if (res.isEmpty) return null;
  return res.first['userId'] as String?;
}

static Future<bool> userExistsById(String userId) async {
  final db = await database;
  final res = await db.query(
    'users',
    columns: ['userId'],
    where: 'userId = ?',
    whereArgs: [userId],
    limit: 1,
  );
  return res.isNotEmpty;
}

static Future<void> ensureUserAndProfile({
  required String userId,
  required String email,
  String? firstName,
  String? lastName,
}) async {
  final exists = await userExistsById(userId);
  if (!exists) {
    await insertUser(
      userId: userId,
      email: email
    );
  }

  final existingProfile = await getUserProfile(userId);
  if (existingProfile == null) {
    await upsertProfile(userId, {
      'firstName': firstName ?? '',
      'lastName': lastName ?? '',
      'email': email,
      'phone': '',
      'address': '',
      'dob': '',
      'gender': '',
      'bloodType': '',
      'height': '',
      'weight': '',
      'allergies': '',
      'conditions': '',
      'medications': '',
      'geneticConditions': '',
      'chronicDiseases': '',
      'emergencyContact': '',
      'insuranceProvider': '',
      'policyNumber': '',
    });
  }
}
}
