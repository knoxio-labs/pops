import AppCore
import DesignSystem
import SwiftUI

internal struct TripsInboxView: View {
    internal let model: TripsInboxModel
    internal let capture: (() -> Void)?

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text("Inbox").font(.popsTitle)
                Text("Captured originals for this trip")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                if let capture {
                    PopsButton("Capture", prominence: .prominent, action: capture)
                }
            }
            switch model.state {
            case .idle:
                Text("Select a trip to read its captures.").font(.popsBody)
            case .unbound:
                Text("Capture reading is not connected.").font(.popsBody)
            case .loading:
                ProgressView("Reading captures")
            case .failed(let error):
                PopsCard(appearance: .featured) {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        Label("Captures unavailable", systemImage: "exclamationmark.triangle")
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsTripsAttention)
                        Text(message(error)).font(.popsBody)
                        if TripsFailureView.canRetry(error) {
                            PopsButton("Retry") { model.retry() }
                        }
                    }
                }
            case .loaded(let workspace):
                content(TripsInboxProjection(workspace: workspace))
            }
        }
        .foregroundStyle(Color.popsForeground)
        .lineLimit(nil)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func content(_ projection: TripsInboxProjection) -> some View {
        if projection.active.isEmpty {
            PopsCard(appearance: .featured) {
                Text("No active captures recorded").font(.popsHeadline)
            }
        } else {
            ForEach(projection.active) { TripsInboxCaptureCard(record: $0) }
        }
        if !projection.removed.isEmpty {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Retained source history")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    ForEach(projection.removed) { TripsInboxCaptureCard(record: $0) }
                }
            } label: {
                Text("Removed captures")
                    .font(.popsHeadline)
                    .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
            }
        }
    }

    private func message(_ error: RepositoryError) -> String {
        switch error {
        case .featureUnavailable:
            "Capture reading is not enabled for this device."
        case .unauthorized:
            "Your session cannot read these captures."
        case .contractMismatch:
            "The capture response could not be read safely."
        case .dependencyNotBound:
            "Capture reading is not connected in this app."
        case .requestRejected:
            "This app cannot read the capture service response."
        default:
            "The capture read failed. Retry to read the recorded originals."
        }
    }
}

private struct TripsInboxCaptureCard: View {
    let record: TripCaptureRecord

    var body: some View {
        PopsCard(appearance: .featured) {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                TripsSourceHeading(
                    title: record.title ?? "Capture \(record.id)", symbol: "tray",
                    context: record.removedAt == nil ? nil : "Removed")
                if let classification = record.classification {
                    Text(classification.rawValue.capitalized)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                if !record.originalText.isEmpty {
                    Text(record.originalText).font(.popsBody)
                }
                if let url = record.originalUrl {
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text("Original link").font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                        Text(url).font(.popsSubheadline)
                    }
                }
                if !record.notes.isEmpty {
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text("Notes").font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                        Text(record.notes).font(.popsBody)
                    }
                }
                if !record.attachments.isEmpty {
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text("Recorded attachments").font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                        ForEach(record.attachments.indices, id: \.self) { index in
                            Text(attachmentLabel(record.attachments[index]))
                                .font(.popsSubheadline)
                        }
                    }
                }
            }
            .textSelection(.enabled)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func attachmentLabel(_ attachment: TripCaptureAttachment) -> String {
        switch attachment {
        case .task(let id): "Document task \(id)"
        case .document(let id, let taskID):
            if let taskID { "Document \(id) · Task \(taskID)" } else { "Document \(id)" }
        }
    }
}
