class PersonalInfoValidators {
  static String? phoneNumber(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please enter your phone number';
    }
    final pattern = r'^(?:\+20|0)?1[0-9]{9}$';
    final regExp = RegExp(pattern);
    if (!regExp.hasMatch(value.trim())) {
      return 'Enter a valid phone number';
    }
    return null;
  }
  static String? address(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please enter your address';
    }
    if (value.trim().length < 5) {
      return 'Address is too short';
    }
    return null;
  }
  static String? dateOfBirth(DateTime? value) {
    if (value == null) {
      return 'Please enter your date of birth';
    }
    final currentDate = DateTime.now();
    if (value.isAfter(currentDate)) {
      return 'Date of birth cannot be in the future';
    }
    return null;
  }
}