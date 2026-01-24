// import 'package:sqflite/sqflite.dart';
// import 'package:path/path.dart';
// import 'package:flutter/material.dart';
// import '../models/created_events.dart';
// import '../utils/schedule_utils.dart';

// // session.dart (Integrated here for simplicity if you don't have a separate file)
// class Session {
//   static String? currentUserId;
// }

// class DBHelper {
//   static Database? _db;
//   static const _dbName = 'medflow.db';
//   static const _version = 1;

//   static Future<Database> get database async {
//     if (_db != null) return _db!;
//     _db = await _initDb();
//     return _db!;
//   }

//   static Future<Database> _initDb() async {
//     final dbPath = await getDatabasesPath();
//     final path = join(dbPath, _dbName);
//     return await openDatabase(
//       path,
//       version: _version,
//       onCreate: _createDb,
//     );
//   }

//   static Future<void> _createDb(Database db, int version) async {
//     // 1. Users Table
//     await db.execute('''
//       CREATE TABLE users (
//         userId TEXT PRIMARY KEY,
//         email TEXT NOT NULL,
//         password TEXT NOT NULL
//       )
//     ''');

//     // 2. Events Table (Linked to userId)
//     await db.execute("""
//     CREATE TABLE events (
//       id TEXT PRIMARY KEY,
//       userId TEXT NOT NULL,
//       title TEXT,
//       details TEXT,
//       date TEXT,
//       time TEXT,
//       type INTEGER,
//       speciality INTEGER,
//       FOREIGN KEY(userId) REFERENCES users(userId)
//     )
//     """);

//     // 3. NEW: User Profile Table (Linked to userId)
//     await db.execute('''
//       CREATE TABLE user_profile (
//         userId TEXT PRIMARY KEY,
//         firstName TEXT,
//         lastName TEXT,
//         email TEXT,
        
//         phone TEXT,
//         address TEXT,
//         dob TEXT,
//         gender TEXT,
        
//         bloodType TEXT,
//         height TEXT,
//         weight TEXT,
//         allergies TEXT,
//         conditions TEXT,
//         medications TEXT,
//         geneticConditions TEXT,
//         chronicDiseases TEXT,
        
//         emergencyContact TEXT,
//         insuranceProvider TEXT,
//         policyNumber TEXT,
        
//         FOREIGN KEY(userId) REFERENCES users(userId)
//       )
//     ''');
//   }

//   // ---------- Users ----------

//   static Future<int> insertUser({
//     required String userId,
//     required String email,
//     required String password,
//   }) async {
//     final db = await database;
//     return await db.insert(
//       'users',
//       {'userId': userId, 'email': email, 'password': password},
//       conflictAlgorithm: ConflictAlgorithm.abort,
//     );
//   }

//   static Future<String?> validateUser(String email, String password) async {
//     final db = await database;
//     final res = await db.query(
//       'users',
//       where: 'email = ? AND password = ?',
//       whereArgs: [email, password],
//       limit: 1,
//     );
//     if (res.isNotEmpty) return res.first['userId'] as String;
//     return null;
//   }

//   static Future<bool> emailExists(String email) async {
//     final db = await database;
//     final res = await db.query('users', where: 'email = ?', whereArgs: [email], limit: 1);
//     return res.isNotEmpty;
//   }

//   // ---------- Profile (NEW) ----------

//   // Create or Update Profile for a specific User ID
//   static Future<int> upsertProfile(String userId, Map<String, dynamic> data) async {
//     final db = await database;
//     // Ensure userId is in the data map
//     data['userId'] = userId;
//     return await db.insert(
//       'user_profile', 
//       data, 
//       conflictAlgorithm: ConflictAlgorithm.replace
//     );
//   }

//   // Get Profile by User ID
//   static Future<Map<String, dynamic>?> getUserProfile(String userId) async {
//     final db = await database;
//     final maps = await db.query(
//       'user_profile', 
//       where: 'userId = ?', 
//       whereArgs: [userId]
//     );

//     if (maps.isNotEmpty) {
//       return maps.first;
//     } else {
//       return null;
//     }
//   }

//   // ---------- Events ----------

//   static Future<int> insertEvent(
//     String userId,
//     Event event,
//     DateTime date,
//   ) async {
//     final db = await DBHelper.database;
//     final id = event.id ?? DateTime.now().millisecondsSinceEpoch.toString();
    
//     final result = await db.insert(
//       'events',
//       {
//         'id': id,                      
//         'userId': userId,
//         'title': event.title,
//         'details': event.details,
//         'date': date.toIso8601String(),
//         'time': '${event.time.hour}:${event.time.minute}',
//         'type': event.selectedTypeOfEventEnum?.index ?? 0,
//         'speciality': event.selectedSpecialityEnum?.index ?? 0,
//       },
//       conflictAlgorithm: ConflictAlgorithm.replace,
//     );
//     return result;
//   }

//   static Future<Map<DateTime, List<Event>>> getAllEventsForUser(String userId) async {
//     final db = await database;
//     final rows = await db.query('events', where: 'userId = ?', whereArgs: [userId], orderBy: 'date ASC, time ASC');
//     final Map<DateTime, List<Event>> result = {};
//     for (final row in rows) {
//       try {
//         final date = DateTime.parse(row['date'] as String);
//         final key = DateTime(date.year, date.month, date.day);
//         final timeParts = (row['time'] as String).split(':');
        
//         final event = Event(
//           title: row['title'] as String? ?? '',
//           id: row['id'].toString(),
//           details: row['details'] as String? ?? '',
//           selectedTypeOfEventEnum: TypeOfEventEnum.values[
//             _parseEnumIndex(row['type'], TypeOfEventEnum.other.index)
//           ],
//           selectedSpecialityEnum: SpecialityEventEnum.values[
//             _parseEnumIndex(row['speciality'], SpecialityEventEnum.other.index)
//           ],
//           time: TimeOfDay(hour: int.parse(timeParts[0]), minute: int.parse(timeParts[1])),
//         );
//         result.putIfAbsent(key, () => []).add(event);
//       } catch (e) {
//         print('Error parsing event row: $row, error: $e');
//       }
//     }
//     return result;
//   }

//   static Future<int> deleteEvent(String eventId) async {
//     final db = await database;
//     return await db.delete('events', where: 'id = ?', whereArgs: [eventId]);
//   }

//   static int _parseEnumIndex(dynamic value, int fallbackIndex) {
//     if (value is int) return value;
//     if (value is String) return int.tryParse(value) ?? fallbackIndex;
//     return fallbackIndex;
//   }
// }