import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:flutter/material.dart';
import '../models/created_events.dart';
import '../models/document.dart'; // Import Document Model
import '../utils/schedule_utils.dart';

class Session {
  static String? currentUserId;
}

class DBHelper {
  static Database? _db;
  static const _dbName = 'medflow.db';
  static const _version = 1;

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
    );
  }

  static Future<void> _createDb(Database db, int version) async {
    // 1. Users
    await db.execute('''
      CREATE TABLE users (
        userId TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        password TEXT NOT NULL
      )
    ''');

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

    // 4. NEW: Documents Table
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
      FOREIGN KEY(userId) REFERENCES users(userId)
    )
    """);
  }

  static Future<void> debugPrintAllTables() async {
    final db = await database;
    print('\n================ DOCUMENTS TABLE ================');
    final docs = await db.query('documents');
    for (var row in docs) print(row);
    print('================================================\n');
  }

  // ... (Users, Auth, Profile methods remain the same) ...
  // ---------- Users & Auth ----------
  static Future<int> insertUser({required String userId, required String email, required String password}) async {
    final db = await database;
    return await db.insert('users', {'userId': userId, 'email': email, 'password': password}, conflictAlgorithm: ConflictAlgorithm.abort);
  }

  static Future<String?> validateUser(String email, String password) async {
    final db = await database;
    final res = await db.query('users', where: 'email = ? AND password = ?', whereArgs: [email, password], limit: 1);
    if (res.isNotEmpty) return res.first['userId'] as String;
    return null;
  }

  static Future<bool> emailExists(String email) async {
    final db = await database;
    final res = await db.query('users', where: 'email = ?', whereArgs: [email], limit: 1);
    return res.isNotEmpty;
  }

  // ---------- Profile ----------
  static Future<int> upsertProfile(String userId, Map<String, dynamic> data) async {
    final db = await database;
    data['userId'] = userId;
    return await db.insert('user_profile', data, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<Map<String, dynamic>?> getUserProfile(String userId) async {
    final db = await database;
    final maps = await db.query('user_profile', where: 'userId = ?', whereArgs: [userId]);
    return maps.isNotEmpty ? maps.first : null;
  }

  // ... (Event methods remain the same) ...
  static Future<int> insertEvent(String userId, Event event, DateTime date) async {
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

  static Future<Map<DateTime, List<Event>>> getAllEventsForUser(String userId) async {
    final db = await database;
    final rows = await db.query('events', where: 'userId = ?', whereArgs: [userId], orderBy: 'date ASC, time ASC');
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
          selectedTypeOfEventEnum: TypeOfEventEnum.values[_parseEnumIndex(row['type'], 0)],
          selectedSpecialityEnum: SpecialityEventEnum.values[_parseEnumIndex(row['speciality'], 0)],
          time: TimeOfDay(hour: int.parse(timeParts[0]), minute: int.parse(timeParts[1])),
        );
        result.putIfAbsent(key, () => []).add(event);
      } catch (e) { print('Error parsing event: $e'); }
    }
    return result;
  }

  static Future<int> deleteEvent(String eventId) async {
    final db = await database;
    return await db.delete('events', where: 'id = ?', whereArgs: [eventId]);
  }

  // ---------- NEW: Documents Methods ----------

  static Future<int> insertDocument(String userId, Document doc) async {
    final db = await database;
    final id = doc.id ?? DateTime.now().millisecondsSinceEpoch.toString();
    
    return await db.insert(
      'documents',
      {
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
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<List<Document>> getDocumentsForUser(String userId) async {
    final db = await database;
    final rows = await db.query('documents', where: 'userId = ?', whereArgs: [userId], orderBy: 'id DESC');
    
    return rows.map((row) {
      final timeParts = (row['time'] as String).split(':');
      return Document(
        id: row['id'] as String,
        title: row['title'] as String,
        filePath: row['filePath'] as String,
        isPDF: (row['isPDF'] as int) == 1,
        summary: row['summary'] as String,
        details: row['details'] as String,
        type: TypeOfEventEnum.values[_parseEnumIndex(row['type'], 0)],
        speciality: SpecialityEventEnum.values[_parseEnumIndex(row['speciality'], 0)],
        time: TimeOfDay(hour: int.parse(timeParts[0]), minute: int.parse(timeParts[1])),
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
}