import AppCore
import DesignSystem
import SwiftUI

internal struct TripCaptureComposer: View {
    @Bindable internal var draft: TripCaptureDraft
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    Text("Keep the original text or link. You can organise it later.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                    Group {
                        PopsTextField(
                            "Text", placeholder: "What would you like to keep?",
                            text: $draft.input.originalText)
                        PopsTextField(
                            "Link", placeholder: "Optional original link", text: originalURL)
                        PopsTextField("Title", placeholder: "Optional title", text: title)
                        PopsTextField(
                            "Notes", placeholder: "Optional notes", text: $draft.input.notes)
                    }
                    .disabled(!draft.canEdit)
                    if draft.storageFailure != nil {
                        Text(
                            "This draft could not be stored on your device. "
                                + "Saving is blocked; keep this screen open until storage is available."
                        )
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                        PopsButton("Retry device storage") { draft.retryStorage() }
                            .disabled(draft.saving)
                    }
                    if draft.saving {
                        ProgressView("Saving capture")
                    } else if let failure = draft.failure {
                        Text(message(failure))
                            .font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                    }
                    if draft.pending != nil {
                        Text(
                            "The original request is retained. Retrying sends the same request; "
                                + "it does not create another capture."
                        )
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        PopsButton("Retry saved request") { draft.retryRetainedRequest() }
                            .disabled(draft.saving || draft.storageFailure != nil)
                    } else {
                        PopsButton("Save capture", prominence: .prominent) {
                            draft.save()
                        }
                        .disabled(!draft.canSubmit || draft.saving)
                    }
                    if let result = draft.result {
                        Text(result.undone ? "This capture was undone." : "Capture saved.")
                            .font(.popsHeadline)
                        ForEach(result.current.captures.filter { $0.removedAt == nil }) { capture in
                            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                                if let title = capture.title { Text(title).font(.popsHeadline) }
                                Text(capture.originalText).font(.popsBody)
                                if let url = capture.originalUrl { Text(url).font(.popsCaption) }
                            }
                        }
                    }
                }
                .padding(PopsSpacing.lg)
            }
            .background(Color.popsBackground)
            .navigationTitle("Capture")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private var originalURL: Binding<String> {
        Binding(
            get: { draft.input.originalUrl ?? "" },
            set: { draft.input.originalUrl = $0.isEmpty ? nil : $0 })
    }
    private var title: Binding<String> {
        Binding(
            get: { draft.input.title ?? "" }, set: { draft.input.title = $0.isEmpty ? nil : $0 })
    }
    private func message(_ failure: RepositoryError) -> String {
        switch failure {
        case .featureUnavailable:
            "Enable capture writes for this device in Devices before saving. Your draft is retained."
        case .unauthorized: "Your session has ended. Your request has not been replaced."
        case .requestRejected: "The service rejected this request. Your original draft is retained."
        case .conflict:
            "This operation conflicts with the recorded source. Your request is retained."
        case .contractMismatch:
            "The save response could not be confirmed. Your request is retained."
        default:
            "The save could not be confirmed. Your original request is retained for an explicit retry."
        }
    }
}
