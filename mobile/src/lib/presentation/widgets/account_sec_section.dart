import 'package:flutter/material.dart';
// import 'package:url_launcher/url_launcher.dart';
import '../../config/app_config.dart';
import '../viewmodels/auth_viewmodel.dart';
import 'package:provider/provider.dart';

class AccountSecuritySection extends StatelessWidget {
  const AccountSecuritySection({super.key});

  // Future<void> _openUrl(BuildContext context, String url) async {
  //   final uri = Uri.parse(url);
  //   final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  //   if (!ok && context.mounted) {
  //     ScaffoldMessenger.of(
  //       context,
  //     ).showSnackBar(const SnackBar(content: Text('Could not open page')));
  //   }
  // }

  // String get _accountBase => '${AppConfig.keycloakIssuer}/account';

  Future<void> _runAction(
    BuildContext context,
    Future<void> Function() action, {
    String success = 'Done',
  }) async {
    try {
      await action();
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(success)));
      }
    } catch (e) {
      if (!context.mounted) return;
      final msg = e.toString();
      final friendly = msg.contains('login_required')
          ? 'Please sign in once to continue this security action.'
          : 'Could not complete action. Please try again.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendly)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Account & Security',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            // ListTile(
            //   contentPadding: EdgeInsets.zero,
            //   leading: const Icon(Icons.manage_accounts_outlined),
            //   title: const Text('Manage Account'),
            //   subtitle: const Text('Profile, sessions, connected apps'),
            //   onTap: () => _openUrl(context, _accountBase),
            // ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.password_outlined),
              title: const Text('Change Password'),
              onTap: () => _runAction(
                context,
                () => context.read<AuthProvider>().updatePassword(),
                success: 'Password updated',
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.verified_user_outlined),
              title: const Text('Set up 2FA (OTP)'),
              onTap: () => _runAction(
                context,
                () => context.read<AuthProvider>().configureTotp(),
                success: '2FA setup completed',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
