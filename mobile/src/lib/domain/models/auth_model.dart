class AuthenticationModel{

    bool success;
    String accessToken;
    String refreshToken;
    String idToken;
    int expiresIn;
    String sub;
    String email;
    String name;

    AuthenticationModel({
        required this.success,
        required this.accessToken,
        required this.idToken,
        required this.refreshToken,
        required this.email,
        required this.expiresIn,
        required this.name,
        required this.sub
    });

    AuthenticationModel.fromJson(Map<String, dynamic> json):
        success = json['success'] as bool,
        accessToken = json['access_token'],
        refreshToken = json['refresh_token'],
        idToken = json['id_token'],
        name = json['name'] as String,
        email=json['email'] as String,
        sub= json['sub'] as String,
        expiresIn = json['expires_in'] as int;

    // refreshRespfromJson(Map<String,dynamic> json){
    //     accessToken = json['accessToken'] as String;
    //     refreshToken = json['refreshToken'] as String;
    //     expiresIn = json['expiresIn'] as int;
        


    // }



    
}