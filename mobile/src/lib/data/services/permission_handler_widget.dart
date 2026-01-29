import 'package:permission_handler/permission_handler.dart';
import 'package:fluttertoast/fluttertoast.dart';

Future<bool> handlePermission(
  Permission permission,
  String name,
) async {
  final status = await permission.request();

  if (status.isGranted) {
    return true;
  }

  if (status.isPermanentlyDenied) {
    Fluttertoast.showToast(
      msg: '$name permission permanently denied. Enable it in settings.',
    );
    openAppSettings();

    return false;
  }

  Fluttertoast.showToast(msg: '$name permission denied');
  return false;

}

