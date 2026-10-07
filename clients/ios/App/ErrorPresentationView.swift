import AppCore
import DesignSystem
import SwiftUI
import UIKit

extension View {
    internal func errorBanner(_ presenter: AppErrorPresenter) -> some View {
        modifier(ErrorPresentationModifier(presenter: presenter))
    }
}

private struct ErrorPresentationModifier: ViewModifier {
    @Bindable var presenter: AppErrorPresenter

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let error = presenter.banner {
                    FailedActionBanner(
                        error: error,
                        openDetails: { presenter.showDetails(error) },
                        dismiss: { presenter.dismiss(error) }
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .sheet(item: $presenter.detail) { error in
                NavigationStack {
                    ErrorDetailSheet(error: error)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $presenter.showsRecentErrors) {
                NavigationStack {
                    RecentErrorsView(errors: presenter.recentErrors)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button(RootCopy.done) { presenter.showsRecentErrors = false }
                            }
                        }
                }
            }
            .animation(.smooth, value: presenter.banner?.id)
    }
}

private struct FailedActionBanner: View {
    let error: PresentedError
    let openDetails: () -> Void
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Button(action: openDetails) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    Image(systemName: "xmark.octagon.fill")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsDestructive)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(error.error.message)
                            .font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(error.error.code)
                            .font(.popsMonospacedCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: PopsSpacing.xs)
                    Image(systemName: "chevron.right")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityHidden(true)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint(RootCopy.showsErrorDetails)

            if error.bannerLifetime == .untilDismissed {
                Button(action: dismiss) {
                    Image(systemName: "xmark")
                        .font(.popsBody)
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel(RootCopy.dismissError)
            }
        }
        .padding(PopsSpacing.md)
        .popsGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.sm)
        .accessibilityElement(children: .contain)
    }
}

private struct ErrorDetailSheet: View {
    let error: PresentedError
    @State private var copied = false

    var body: some View {
        List {
            Section(RootCopy.whatHappened) {
                Label {
                    Text(error.error.message)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                } icon: {
                    Image(systemName: "xmark.octagon.fill")
                        .foregroundStyle(Color.popsDestructive)
                }
                .accessibilityElement(children: .combine)
            }
            Section(RootCopy.diagnostics) {
                diagnosticRow(RootCopy.DiagnosticLabel.code, value: error.error.code)
                diagnosticRow(RootCopy.DiagnosticLabel.requestID, value: error.requestID)
                LabeledContent(RootCopy.DiagnosticLabel.operation, value: error.operation)
                LabeledContent(RootCopy.DiagnosticLabel.time, value: error.occurredAtText)
                LabeledContent(RootCopy.DiagnosticLabel.build, value: error.build)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.popsBackground)
        .listStyle(.insetGrouped)
        .navigationTitle(RootCopy.errorDetailsTitle)
        .popsTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    UIPasteboard.general.string = error.copiedDetails
                    copied = true
                } label: {
                    Label(
                        copied ? RootCopy.copied : RootCopy.copy,
                        systemImage: copied ? "checkmark" : "doc.on.doc")
                }
                .accessibilityHint(RootCopy.copyHint)
            }
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

private struct RecentErrorsView: View {
    let errors: RecentErrors
    @State private var detail: PresentedError?

    var body: some View {
        Group {
            if errors.entries.isEmpty {
                ContentUnavailableView {
                    Label(RootCopy.noRecentErrors, systemImage: "checkmark.circle")
                } description: {
                    Text(RootCopy.recentErrorsEmpty)
                }
            } else {
                List(errors.entries) { error in
                    Button {
                        detail = error
                    } label: {
                        RecentErrorRow(error: error)
                    }
                    .buttonStyle(.plain)
                }
                .scrollContentBackground(.hidden)
                .background(Color.popsBackground)
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(RootCopy.recentErrorsTitle)
        .sheet(item: $detail) { error in
            NavigationStack {
                ErrorDetailSheet(error: error)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

private struct RecentErrorRow: View {
    let error: PresentedError

    var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Image(systemName: "xmark.octagon.fill")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsDestructive)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(error.operation)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(error.error.message)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(2)
                Text(error.error.code)
                    .font(.popsMonospacedCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
                Text(error.occurredAtText)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Image(systemName: "chevron.right")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(RootCopy.showsErrorDetails)
    }
}
