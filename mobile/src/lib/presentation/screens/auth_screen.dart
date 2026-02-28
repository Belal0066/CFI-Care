import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../viewmodels/auth_viewmodel.dart';

class AuthEntryScreen extends StatefulWidget {
  const AuthEntryScreen({super.key});

  @override
  State<AuthEntryScreen> createState() => _AuthEntryScreenState();
}

class _AuthEntryScreenState extends State<AuthEntryScreen> {
  bool _started = false;

  // @override
  // void didChangeDependencies() {
  //   super.didChangeDependencies();
  //   if (_started) return;
  //   _started = true;

  //   Future.microtask(() async {
  //     final auth = context.read<AuthProvider>();

  //     if (auth.status == AuthStatus.authenticating ||
  //         auth.status == AuthStatus.refreshing ||
  //         auth.status == AuthStatus.authenticated) {
  //       return;
  //     }

  //     await auth.login();
  //   });
  // }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (_, auth, __) {
        final busy = auth.status == AuthStatus.authenticating ||
            auth.status == AuthStatus.refreshing ||
            auth.status == AuthStatus.unknown;

        return Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (busy) ...[
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    const Text('Opening login screen..'),
                  ] else ...[
                    const Text(
                      'login was cancelled or failed.',
                      textAlign: TextAlign.center,
                    ),
                    if (auth.errorMessage != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        auth.errorMessage!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => context.read<AuthProvider>().login(),
                      child: const Text('Try again'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}