import AppCore
import DesignSystem
import SwiftUI

/// What one staged receipt has become, so far.
internal struct ReceiptReading: Identifiable, Hashable {
    internal enum Outcome: Hashable {
        case queued
        case reading
        /// What the model made of it. Reported per receipt as it lands rather
        /// than held back until all of them finish: a person who photographed
        /// four things wants to know the Bunnings one came out before the
        /// other three are done.
        case read(merchant: String, total: MoneyAmount, lines: Int)
        /// The bytes arrived and were stored; no reading could be made of
        /// them. Not a failure of the call, which is why this does not stop
        /// the rest.
        case unreadable(reason: String)

        internal var isSettled: Bool {
            switch self {
            case .queued, .reading: false
            case .read, .unreadable: true
            }
        }
    }

    internal let id: String
    internal let pages: [StagedPage]
    internal var outcome: Outcome
}

/// Reading what was staged, one row per receipt, reporting as it goes.
///
/// A system list, because it is one: a row per call, each landing at its own
/// time, and a row with a merchant and a total on it is one somebody can stop
/// worrying about. Nothing in flight is a spinner; a row being read shows the
/// shape of what is coming as a placeholder that breathes.
///
/// A receipt that could not be read does not stop the others and does not
/// leave the batch. It goes to review with nothing filled in, because a
/// receipt nobody could read is still a purchase somebody made.
///
/// The way onward, Review, sits in the navigation bar from the start and
/// enables when the last one lands: a review opened half-way through would be
/// missing rows that are still coming. Nothing is written here, so Cancel is
/// an ordinary control and asks nothing.
internal struct PurchaseProcessingSurface: View {
    @State private var readings: [ReceiptReading]
    @State private var reviewing = false
    private let landing: [String: ReceiptReading.Outcome]
    @Environment(\.dismiss) private var dismiss

    /// - Parameter landing: what each unsettled reading becomes, played one
    ///   beat at a time so the screen can be watched working. Empty for a
    ///   state that holds still.
    internal init(
        readings: [ReceiptReading], landing: [String: ReceiptReading.Outcome] = [:]
    ) {
        _readings = State(initialValue: readings)
        self.landing = landing
    }

    private var done: Int { readings.filter(\.outcome.isSettled).count }

    private var finished: Bool { done == readings.count }

    internal var body: some View {
        List {
            ForEach(readings) { reading in
                PurchaseReadingRow(reading: reading)
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Reading")
        .navigationSubtitle(
            finished ? "All \(readings.count) done" : "\(done) of \(readings.count)"
        )
        .playgroundTitleDisplay(large: false)
        .navigationBarBackButtonHidden()
        .playgroundLeadingBarItem {
            Button("Cancel") { dismiss() }
        }
        .playgroundTrailingBarItem {
            Button("Review") { reviewing = true }
                .playgroundProminentGlassButton()
                .disabled(!finished)
        }
        .navigationDestination(isPresented: $reviewing) {
            PurchaseReviewSurface(entries: PurchaseReviewSurfaces.batch)
        }
        .inventoryMotion(InventoryMotion.smooth, value: readings)
        .task { await play() }
        .tint(.popsAccent)
    }

    /// Settles the reading in flight, starts the next queued one, and waits a
    /// beat, until nothing is left to land.
    private func play() async {
        while let active = readings.firstIndex(where: {
            landing[$0.id] != nil && !$0.outcome.isSettled
        }) {
            try? await Task.sleep(for: InventoryMotion.stagedBeat)
            guard !Task.isCancelled else { return }
            if readings[active].outcome == .queued {
                readings[active].outcome = .reading
                continue
            }
            if let outcome = landing[readings[active].id] {
                readings[active].outcome = outcome
            }
            if let next = readings.firstIndex(where: { $0.outcome == .queued }) {
                readings[next].outcome = .reading
            }
        }
    }
}

/// One receipt in the reading list: the pages, then what they turned into.
internal struct PurchaseReadingRow: View {
    internal let reading: ReceiptReading

    private let stackWidth: CGFloat = 36
    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth
    private let fanStep: CGFloat = 3

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            fan
            detail
                .frame(maxWidth: .infinity, alignment: .leading)
            mark
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    /// The pages fanned rather than one thumbnail, so a three-page receipt is
    /// visibly three pages at the size a row allows.
    private var fan: some View {
        ZStack {
            ForEach(Array(reading.pages.prefix(3).enumerated()), id: \.element.id) { index, page in
                PopsPhoto(data: page.bytes, placeholderSymbol: page.symbolName)
                    .frame(width: stackWidth, height: stackWidth * ratio)
                    .rotationEffect(.degrees(Double(index - 1) * fanStep))
                    .offset(x: CGFloat(index - 1) * PopsSpacing.xs)
            }
        }
        .frame(width: stackWidth + PopsSpacing.sm)
        .opacity(reading.outcome == .queued ? 0.4 : 1)
        .accessibilityHidden(true)
    }

    @ViewBuilder private var detail: some View {
        switch reading.outcome {
        case .queued:
            Text("Waiting")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
        case .reading:
            PurchaseReadingSkeleton()
        case .read(let merchant, let total, let lines):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(merchant)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text("\(total.formatted()) · \(lines == 1 ? "1 item" : "\(lines) items")")
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .transition(.opacity)
        case .unreadable(let reason):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("Unreadable")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(reason)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .transition(.opacity)
        }
    }

    @ViewBuilder private var mark: some View {
        switch reading.outcome {
        case .queued, .reading:
            EmptyView()
        case .read:
            Image(systemName: "checkmark.circle.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsSuccess)
                .transition(.scale.combined(with: .opacity))
        case .unreadable:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
                .transition(.scale.combined(with: .opacity))
        }
    }
}

/// The shape of a merchant and a total, before there is either: two bars that
/// breathe while the call is out. Still under Reduce Motion.
internal struct PurchaseReadingSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            bar(width: 128, height: 14)
            bar(width: 88, height: 11)
        }
        .phaseAnimator(reduceMotion ? [1.0] : [1.0, 0.45]) { content, phase in
            content.opacity(phase)
        } animation: { _ in
            .easeInOut(duration: 0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Reading")
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        Capsule()
            .fill(Color.popsMutedForeground.opacity(0.25))
            .frame(width: width, height: height)
    }
}
