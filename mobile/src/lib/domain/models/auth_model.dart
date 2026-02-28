class AuthModel {
  final String accessToken;
  final String? refreshToken;
  final String? idToken;
  final DateTime expiresAt;

  final String subject;
  final String? email;
  final String? name;

  const AuthModel({
    required this.accessToken,
    required this.expiresAt,
    required this.subject,
    this.refreshToken,
    this.idToken,
    this.email,
    this.name,
  });




  bool get isAccessTokenExpired {
    final safeNow = DateTime.now().add(const Duration(seconds: 30));
    return safeNow.isAfter(expiresAt);
  }

 






  //     bool success;
  //     String accessToken;
  //     String refreshToken;
  //     String idToken;
  //     int expiresIn;
  //     String sub;
  //     String email;
  //     String name;

  //     AuthenticationModel({
  //         required this.success,
  //         required this.accessToken,
  //         required this.idToken,
  //         required this.refreshToken,
  //         required this.email,
  //         required this.expiresIn,
  //         required this.name,
  //         required this.sub
  //     });

  //     AuthenticationModel.fromJson(Map<String, dynamic> json):
  //         success = json['success'] as bool,
  //         accessToken = json['access_token'],
  //         refreshToken = json['refresh_token'],
  //         idToken = json['id_token'],
  //         name = json['name'] as String,
  //         email=json['email'] as String,
  //         sub= json['sub'] as String,
  //         expiresIn = json['expires_in'] as int;

  //     // refreshRespfromJson(Map<String,dynamic> json){
  //     //     accessToken = json['accessToken'] as String;
  //     //     refreshToken = json['refreshToken'] as String;
  //     //     expiresIn = json['expiresIn'] as int;

  //     // }
}
