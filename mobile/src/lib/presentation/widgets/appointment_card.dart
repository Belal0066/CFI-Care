import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../domain/models/appointment_history.dart';
import '../viewmodels/booking_provider.dart';

class AppointmentCard extends StatelessWidget {
  final AppointmentHistory appointment;
  const AppointmentCard({super.key, required this.appointment});

  @override
  Widget build(BuildContext context) {
    final isCanceled = appointment.status == AppointmentStatus.canceled;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: isCanceled ? Border.all(color: Colors.red.shade100) : null,
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                // Doctor Image
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFF0073CF),
                      width: 2,
                    ),
                  ),
                  child: CircleAvatar(
                    radius: 30,
                    backgroundImage: NetworkImage(appointment.doctor.imageUrl),
                    backgroundColor: Colors.grey.shade200,
                  ),
                ),
                const SizedBox(width: 16),
                
                // Details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Dr. ${appointment.doctor.name}",
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: isCanceled ? Colors.grey : Colors.black87,
                          decoration: isCanceled ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        appointment.doctor.title,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                        maxLines: 1, 
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      // Date & Time Row
                      Row(
                        children: [
                          Icon(Icons.calendar_today, size: 14, color: Colors.grey.shade600),
                          const SizedBox(width: 4),
                          Text(
                            "${appointment.date} • ${appointment.time}",
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.grey.shade700),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      // Location Row
                      Row(
                        children: [
                          Icon(Icons.location_on, size: 14, color: Colors.grey.shade600),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              appointment.doctor.address,
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          
          // Status Footer
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: isCanceled ? Colors.red.shade50 : const Color(0xFFE3F2FD),
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Status Text
                Row(
                  children: [
                    Icon(
                      isCanceled ? Icons.cancel : Icons.check_circle,
                      size: 16,
                      color: isCanceled ? Colors.red : const Color(0xFF0073CF),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      isCanceled ? "Appointment Canceled" : "Booking Confirmed",
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: isCanceled ? Colors.red : const Color(0xFF0073CF),
                      ),
                    ),
                  ],
                ),
                
                // Cancel Button (Only show if not canceled)
                if (!isCanceled)
                  InkWell(
                    onTap: () {
                      context.read<BookingProvider>().cancelAppointment(appointment.id);
                    },
                    child: const Text(
                      "Cancel",
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.red,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// //-- Extension to check if appointment is canceled --
// extension on AppointmentHistory {
//   bool get isCanceled => status == AppointmentStatus.canceled;
// }