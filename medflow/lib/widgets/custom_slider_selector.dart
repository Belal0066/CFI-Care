import 'package:flutter/material.dart';
// import 'package:medflow/widgets/theme.dart';

class CustomSliderSelector extends StatefulWidget {
  const CustomSliderSelector({
    super.key,
    required this.options,
    required this.selectedIndex,
    required this.onChangedIndex,
  });

  /// List of option labels (e.g. ['Login', 'Register'])
  final List<String> options;

  /// Currently selected index
  final int selectedIndex;

  /// Callback when user selects a new index
  final Function(int index) onChangedIndex;

  @override
  State<CustomSliderSelector> createState() => _CustomSliderSelectorState();
}

class _CustomSliderSelectorState extends State<CustomSliderSelector> {
  @override
  Widget build(BuildContext context) {
    const double radius = 28.0;

    return Container(
      height: 48,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color.fromARGB(102, 238, 238, 238),
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Row(
        children: List.generate(widget.options.length, (index) {
          final bool isSelected = widget.selectedIndex == index;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() {
                  widget.onChangedIndex(index);
                });
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isSelected ? Colors.blue.shade700 : Colors.transparent,
                  borderRadius: BorderRadius.circular(radius),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: Colors.black12,
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Text(
                  widget.options[index],
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? Colors.black : Colors.grey.shade700,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}
