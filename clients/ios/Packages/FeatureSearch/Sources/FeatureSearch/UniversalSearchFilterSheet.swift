import DesignSystem
import SwiftUI

/// A universal-search filter sheet around caller-supplied pillar fields.
public struct UniversalSearchFilterSheet<FilterFields: View>: View {
    private let isFiltered: Bool
    private let tint: Color
    private let reset: () -> Void
    @ViewBuilder private let fields: () -> FilterFields
    @Environment(\.dismiss) private var dismiss

    /// Creates a filter sheet that applies fields as they change.
    public init(
        isFiltered: Bool,
        tint: Color,
        reset: @escaping () -> Void,
        @ViewBuilder fields: @escaping () -> FilterFields
    ) {
        self.isFiltered = isFiltered
        self.tint = tint
        self.reset = reset
        self.fields = fields
    }

    public var body: some View {
        NavigationStack {
            Form { fields() }
                .formStyle(.grouped)
                .navigationTitle("Filters")
                .popsTitleDisplay(large: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Reset", action: reset)
                            .disabled(Self.resetDisabled(isFiltered: isFiltered))
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                            .popsProminentGlassButton()
                    }
                }
        }
        .tint(tint)
        .presentationDetents([.large])
    }

    nonisolated internal static func resetDisabled(isFiltered: Bool) -> Bool { !isFiltered }
}
