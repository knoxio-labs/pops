import DesignSystem
import SwiftUI

internal struct ErrorDetailSheet: View {
    internal let error: PresentedError
    @State private var copied: Bool

    internal init(error: PresentedError, copied: Bool = false) {
        self.error = error
        _copied = State(initialValue: copied)
    }

    internal var body: some View {
        List {
            Section("What happened") {
                Label {
                    Text(error.message)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                } icon: {
                    Image(systemName: "xmark.octagon.fill")
                        .foregroundStyle(Color.popsDestructive)
                }
                .accessibilityElement(children: .combine)
            }
            Section("Diagnostics") {
                diagnosticRow("Code", value: error.code)
                diagnosticRow("Request ID", value: error.requestID)
                LabeledContent("Operation", value: error.operation)
                LabeledContent("Time", value: error.occurredAt)
                LabeledContent("Build", value: error.build)
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Error details")
        .playgroundTitleDisplay(large: false)
        .playgroundTrailingBarItem {
            Button {
                playgroundCopy(error.copiedDetails)
                copied = true
            } label: {
                Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
            }
            .playgroundGlassButton()
            .accessibilityHint("Copies the message and diagnostics")
        }
    }

    private func diagnosticRow(_ label: String, value: String) -> some View {
        LabeledContent(label) {
            Text(value)
                .font(.popsMonospacedCaption)
                .foregroundStyle(Color.popsForeground)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
    }
}
