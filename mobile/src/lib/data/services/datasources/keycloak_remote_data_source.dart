import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import '../../../domain/models/auth_model.dart';
import 'dart:convert';

import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/services.dart';

class KeycloakRemoteDataSource {

    // final http.Client client;
    

    // Future <void> loadcerts() async{

    //   ByteData rootCACertificate = await rootBundle.load("assets/ca.pem");
    //   ByteData clientCertificate = await rootBundle.load("assets/cert.pem");
    //   ByteData privateKey = await rootBundle.load("assets/key.pem");

    //   final context = SecurityContext.defaultContext;

    // }

    
    // //use mkcert certs
    // final httpclient = HttpClient()   //..badCertificateCallback=((X509Certificate cert, String Host, int port) => true);

    // final client = IOClient(httpclient)

    // Future<dynamic> loadcerts() async{
    //     ByteData rootCACertificate = await rootBundle.load("assets/ca/rootCa.pem");
    //     ByteData clientCertificate = await rootBundle.load("assets/ca/cert.pem");
    //     ByteData privateKey = await rootBundle.load("assets/ca/key.pem");

      
    //   final context = SecurityContext.defaultContext;
    //   context.setTrustedCertificatesBytes(rootCACertificate.buffer.asUint8List());
    //   context.setTrustedCertificatesBytes(clientCertificate.buffer.asUint8List());
    //   context.usePrivateKeyBytes(privateKey.buffer.asUint8List());
    //   final httpclient = HttpClient(context: context);
    //   httpclient.badCertificateCallback=((X509Certificate cert , String Host , int port )=> true);
    //   return IOClient(httpclient);

    // }
    // HttpClient client = new HttpClient();
    // client.badCertificateCallback =((X509Certificate cert, String  host, int port) => true);



    // KeycloakRemoteDataSource({required this.client});

    Future<AuthenticationModel> login(String email, String pass) async{
        

        final url = Uri.parse('http://10.0.2.2:3000/auth/mobile-login');
        final headers = {'Content-Type': 'application/json'};
        final body = jsonEncode({'email': email, 'password': pass});


        // try{
        final response = await http.post(url, headers: headers, body: body);
        // final client = await loadcerts();
        // final response = await client.post(url, headers: headers , body: body);


        if (response.statusCode == 200) {
            var data = jsonDecode(response.body);
            // print(data);
            return AuthenticationModel.fromJson(data);
        } else if(response.statusCode==400){
            throw Exception('Invalid credentails , please try again');
        } else{
            throw Exception('Failed to login');
           
        }

        // }
        // catch(e){
        //     throw Exception('Failed to login ; $e');
        // }
    }

    Future <bool> register(String fName, String lName , String email, String pass) async{
        final url = Uri.parse('http://10.0.2.2:3000/auth/mobile-register');
        final headers = {'Content-Type': 'application/json'};
        final body = jsonEncode({'email': email, 'password': pass , 'firstName': fName , 'lastName' : lName});


        // try{
        final response = await http.post(url, headers: headers, body: body);

        // final client = await loadcerts();
        // final response = await client.post(url, headers: headers , body: body);

        if (response.statusCode == 200) {
            var data = jsonDecode(response.body);
            return jsonDecode(data);
        }
         else if(response.statusCode==400){
            throw Exception('user already exists');
        }
        else {
            throw Exception('Registrastion failed');
        }

    }

    Future <bool> logout() async{
        final url = Uri.parse('http://10.0.2.2:3000/auth/mobile-logout');
        final headers = {'Content-Type': 'application/json'};
        final response = await http.post(url, headers: headers);
        // final client = await loadcerts();
        // final response = await client.post(url, headers: headers);
        

        if (response.statusCode == 200) {
            return true;
        } else {
            throw Exception('Logout failed');
        }
    }

    Future <AuthenticationModel> refreshtoken(String refreshtoken) async{
        final url = Uri.parse('http://10.0.2.2:3000/auth/refresh');
        final headers = {'Content-Type': 'application/json'};
        final body = jsonEncode({'refresh_token': refreshtoken});
        final response = await http.post(url, headers: headers, body: body);
        // final client = await loadcerts();
        // final response = await client.post(url, headers: headers , body: body);
        
        if (response.statusCode == 200) {
            var data = jsonDecode(response.body);
            return AuthenticationModel.fromJson(data);   // has so many null fields , will refactor :( 
        } else {
            throw Exception('Refresh failed');
        }
    }






}
