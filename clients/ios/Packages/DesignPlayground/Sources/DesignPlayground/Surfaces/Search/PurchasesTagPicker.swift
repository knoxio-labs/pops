import DesignSystem
import SwiftUI

/// The tags purchases' lines carry, most used first, any number of them
/// chosen. A native checklist rather than chips: the list is as long as the
/// tags in use, and a checklist is what the system draws for "pick several
/// from a known set".
internal struct PurchasesTagPicker: View {
    @Binding internal var selection: Set<String>
    internal let tags: [(tag: String, count: Int)]

    internal var body: some View {
        List {
            Section {
                row(title: "Any", count: nil, isOn: selection.isEmpty) { selection = [] }
            }
            Section {
                ForEach(tags, id: \.tag) { entry in
                    row(title: entry.tag, count: entry.count, isOn: selection.contains(entry.tag)) {
                        toggle(entry.tag)
                    }
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Tags")
        .playgroundTitleDisplay(large: false)
        .inventoryMotion(value: selection)
    }

    private func row(
        title: String, count: Int?, isOn: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.sm) {
                Label(title, systemImage: count == nil ? "tag.slash" : "tag")
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if let count {
                    Text("\(count)")
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Image(systemName: "checkmark")
                    .font(.popsBody.weight(.semibold))
                    .foregroundStyle(.tint)
                    .opacity(isOn ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private func toggle(_ tag: String) {
        if selection.contains(tag) {
            selection.remove(tag)
        } else {
            selection.insert(tag)
        }
    }
}
