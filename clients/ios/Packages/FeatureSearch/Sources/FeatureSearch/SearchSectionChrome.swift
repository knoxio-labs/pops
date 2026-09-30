import AppCore
import DesignSystem
import SwiftUI

/// A row-free summary of one pillar search section.
public enum SearchSectionSummary: Equatable, Sendable {
    /// The visible and server-reported result counts, plus whether stale rows are refining.
    case results(shown: Int, total: Int, isRefining: Bool)
    /// The first result page is loading.
    case loading
    /// The pillar failed to answer and can be retried.
    case failed
    /// The device is offline.
    case offline
    /// The pillar is not installed on this phone.
    case notOnPhone
}

/// Shared header and state presentation around pillar-specific result rows.
public struct SearchSectionChrome<Rows: View>: View {
    private let pillar: SearchPillar
    private let summary: SearchSectionSummary
    private let pagingState: SearchPagingState
    private let isScoped: Bool
    private let showAll: () -> Void
    private let retry: () -> Void
    private let retryNextPage: () -> Void
    private let download: () -> Void
    private let rows: Rows

    /// Creates section chrome around caller-provided result rows.
    ///
    /// - Parameters:
    ///   - pagingState: State of the next page footer below loaded rows.
    ///   - retryNextPage: Retries the failed continuation cursor without replacing loaded rows.
    public init(
        pillar: SearchPillar,
        summary: SearchSectionSummary,
        pagingState: SearchPagingState = .idle,
        isScoped: Bool,
        showAll: @escaping () -> Void,
        retry: @escaping () -> Void,
        retryNextPage: @escaping () -> Void = {},
        download: @escaping () -> Void,
        @ViewBuilder rows: () -> Rows
    ) {
        self.pillar = pillar
        self.summary = summary
        self.pagingState = pagingState
        self.isScoped = isScoped
        self.showAll = showAll
        self.retry = retry
        self.retryNextPage = retryNextPage
        self.download = download
        self.rows = rows()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            header
            content
        }
        .tint(pillar.tint)
        .transition(.opacity)
    }

    @ViewBuilder private var header: some View {
        if case .results(let shown, let total, let isRefining) = summary {
            let trailing = SearchSectionHeaderTrailing(
                shown: shown, total: total, isRefining: isRefining, isScoped: isScoped)
            if isScoped {
                PopsSectionHeader(
                    title: "Results", trailing: trailing.countText)
            } else {
                SearchPillarHeader(pillar: pillar, trailing: trailing, showAll: showAll)
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch summary {
        case .results(_, _, let isRefining):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                PopsListPanel { rows }
                    .opacity(isRefining ? 0.45 : 1)
                    .popsMotion(value: isRefining)
                pagingFooter
            }
        case .loading:
            PopsListSkeleton(rows: isScoped ? 6 : 3)
        case .failed:
            if pagingState == .failed || pagingState == .loading {
                pagingFooter
            } else {
                SearchStatusRow(
                    symbol: "exclamationmark.triangle.fill", tone: .popsWarning,
                    text: "\(pillar.title) didn't answer", actionTitle: "Retry", action: retry)
            }
        case .offline:
            if pagingState == .failed || pagingState == .loading {
                pagingFooter
            } else {
                SearchStatusRow(
                    symbol: "wifi.slash", tone: .popsMutedForeground,
                    text: "Offline. Searches when you're back.")
            }
        case .notOnPhone:
            SearchStatusRow(
                symbol: pillar.symbol, tone: .popsMutedForeground,
                text: "Not on this phone yet", actionTitle: "Download", action: download)
        }
    }

    @ViewBuilder private var pagingFooter: some View {
        switch pagingState {
        case .idle, .exhausted:
            EmptyView()
        case .loading:
            HStack(spacing: PopsSpacing.sm) {
                ProgressView()
                Text("Loading more results")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(minHeight: PopsSize.touchTarget)
            .padding(.horizontal, PopsSpacing.md)
            .accessibilityElement(children: .combine)
        case .failed:
            HStack(spacing: PopsSpacing.sm) {
                Text("Couldn't load more results")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                Spacer(minLength: PopsSpacing.sm)
                Button("Retry", action: retryNextPage)
                    .frame(minHeight: PopsSize.touchTarget)
            }
            .padding(.horizontal, PopsSpacing.md)
        }
    }
}

private struct SearchPillarHeader: View {
    let pillar: SearchPillar
    let trailing: SearchSectionHeaderTrailing
    let showAll: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Label(pillar.title, systemImage: pillar.symbol)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            trailingView
        }
        .padding(.horizontal, PopsSpacing.md)
    }

    @ViewBuilder private var trailingView: some View {
        switch trailing {
        case .none:
            EmptyView()
        case .count(let count):
            countText(count)
        case .showAll(let count):
            Button(action: showAll) {
                HStack(spacing: PopsSpacing.xs) {
                    Text("\(count)").monospacedDigit()
                    Image(systemName: "chevron.forward")
                }
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(.tint)
                .frame(minHeight: PopsSize.touchTarget / 2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("All \(count) in \(pillar.title)")
        case .pending:
            Capsule()
                .fill(Color.popsMutedForeground.opacity(0.3))
                .frame(width: PopsSpacing.lg, height: PopsSpacing.sm)
                .popsShimmer()
                .accessibilityLabel("Searching")
        }
    }

    private func countText(_ count: Int) -> some View {
        Text("\(count)")
            .font(.popsCaption)
            .monospacedDigit()
            .foregroundStyle(Color.popsMutedForeground)
    }
}

private struct SearchStatusRow: View {
    let symbol: String
    let tone: Color
    let text: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        PopsListPanel {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(tone)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .accessibilityHidden(true)
                Text(text).font(.popsSubheadline)
                Spacer(minLength: PopsSpacing.sm)
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                }
            }
        }
        .popsFadeIn()
    }
}

extension SearchSectionHeaderTrailing {
    fileprivate var countText: String? {
        guard case .count(let count) = self else { return nil }
        return "\(count)"
    }
}
