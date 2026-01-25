import 'package:flutter/material.dart';
// import '../screens/doctor_list_screen.dart';
class SpecialtyItem extends StatelessWidget {
  final String title;
  final IconData icon;
  final VoidCallback onTap;

  const SpecialtyItem({required this.title, required this.icon, required this.onTap, super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey.shade200, width: 1.0),
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        // onTap: () {
        //   Navigator.push(
        //     context,
        //     MaterialPageRoute(
        //       builder: (context) => DoctorListScreen(specialtyName: item.name),
        //     ),
        //   );
        // },
        onTap: onTap,
        leading: SizedBox(
          height: 45,
          width: 40,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: const Color(0xFF0073CF), size: 28),
              const SizedBox(height: 4),
              Container(
                width: 12,
                height: 3,
                decoration: BoxDecoration(
                  color: const Color(0xFFD32F2F),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ],
          ),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            color: Color(0xFF555555),
            fontWeight: FontWeight.w400,
          ),
        ),
      ),
    );
  }
}
