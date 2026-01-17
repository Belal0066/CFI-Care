import 'appointments.dart';
import 'review.dart';
class Doctor {
  final String id;
  final String name;
  final String title; // e.g. "Dermatology Consultant"
  final String imageUrl; // URL or asset path
  final double rating;
  final int visitorCount;
  final String specialtyDetail;
  final String address;
  final int fees;
  final int waitingTime;
  final String nextAvailable;
  final List<String> tags; // e.g. ["Hygiene", "Good Listener"]
  // final bool isSponsored;
  final String about;
  final List<AppointmentDay> schedule;
  final List<Review> reviews;

  Doctor({
    required this.id,
    required this.name,
    required this.title,
    required this.imageUrl,
    required this.rating,
    required this.visitorCount,
    required this.specialtyDetail,
    required this.address,
    required this.fees,
    required this.waitingTime,
    required this.nextAvailable,
    this.tags = const [],
    // this.isSponsored = false,
    this.about = "",
    required this.schedule, 
    required this.reviews,
  });
}