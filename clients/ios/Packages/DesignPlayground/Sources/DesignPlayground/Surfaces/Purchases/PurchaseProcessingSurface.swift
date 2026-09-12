import AppCore
import DesignSystem
import SwiftUI

/// What one staged receipt has become, so far.
internal struct ReceiptReading: Identifiable, Hashable {
    internal enum Outcome: Hashable {
        case queued
        case reading
        /// What the model made of it. Reported per receipt as it lands rather
        /// than held back until all of them finish — a person who
        /// photographed four things wants to know the Bunnings one came out,
        /// and wants to know it before the other three are done.
        case read(merchant: String, total: MoneyAmount, lines: Int)
        /// The bytes arrived and were stored; no reading could be made of
        /// them. Not a failure of the call, which is why this does not stop
        /// the rest.
        case unreadable(reason: String)
    }

    internal let id: String
    internal let pages: [StagedPage]
    internal let outcome: Outcome
}

/// Reading what was staged, reporting as it goes.
///
/// One row per receipt, each saying what it is doing and then what it found.
/// A single bar over the whole batch would be the honest shape only if the
/// work were one thing; it is one call per receipt, they land at different
/// times, and a row that already has a merchant and a total on it is a row
/// somebody can stop worrying about.
///
/// A receipt that could not be read does not stop the others and does not
/// leave the batch. It goes to the review step with nothing filled in, which
/// is the same form every other one gets — a receipt nobody could read is
/// still a purchase somebody made.
///
/// Nothing is written while this is on screen. The read call creates no
/// purchase (POPS-3646); saving from the review step is what does. So
/// cancelling here costs the reading and nothing else, which is why Cancel is
/// an ordinary control rather than a destructive one.
internal struct PurchaseProcessingSurface: View {
    internal let readings: [ReceiptReading]

    private let stackWidth: CGFloat = 44
    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth
    private let fanStep: CGFloat = 3

    private var done: Int {
        readings.filter {
            if case .queued = $0.outcome { return false }
            if case .reading = $0.outcome { return false }
            return true
        }.count
    }

    private var finished: Bool { done == readings.count }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                header
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(readings) { reading in
                        row(reading)
                        if reading.id != readings.last?.id { PopsDivider() }
                    }
                }
                .padding(.horizontal, PopsSpacing.md)
                .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .overlay(alignment: .bottom) { actions }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(finished ? "Read" : "Reading")
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
            Text(
                finished
                    ? "Nothing is saved yet. Check each one, then save."
                    : "\(done) of \(readings.count) done. Nothing is saved yet."
            )
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
            ProgressView(value: Double(done), total: Double(max(readings.count, 1)))
                .tint(Color.popsAccent)
        }
    }

    /// The pages fanned rather than one thumbnail, so a three-page receipt is
    /// visibly three pages at the size a row allows.
    private func fan(_ pages: [StagedPage], dimmed: Bool) -> some View {
        ZStack {
            ForEach(Array(pages.prefix(3).enumerated()), id: \.element.id) { index, page in
                PopsPhoto(data: page.bytes, placeholderSymbol: "doc.richtext")
                    .frame(width: stackWidth, height: stackWidth * ratio)
                    .rotationEffect(.degrees(Double(index - 1) * fanStep))
                    .offset(x: CGFloat(index - 1) * PopsSpacing.xs)
            }
        }
        .opacity(dimmed ? 0.4 : 1)
        .accessibilityHidden(true)
    }

    private func row(_ reading: ReceiptReading) -> some View {
        HStack(alignment: .center, spacing: PopsSpacing.md) {
            fan(reading.pages, dimmed: reading.outcome == .queued)
            detail(reading.outcome)
            Spacer(minLength: PopsSpacing.sm)
            badge(reading.outcome)
        }
        .padding(.vertical, PopsSpacing.md)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func detail(_ outcome: ReceiptReading.Outcome) -> some View {
        switch outcome {
        case .queued:
            line("Waiting", Color.popsMutedForeground)
        case .reading:
            line("Reading…", Color.popsForeground)
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
        case .unreadable(let reason):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("Could not be read")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(reason)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(2)
            }
        }
    }

    private func line(_ text: String, _ tone: Color) -> some View {
        Text(text)
            .font(.popsSubheadline)
            .foregroundStyle(tone)
    }

    @ViewBuilder private func badge(_ outcome: ReceiptReading.Outcome) -> some View {
        switch outcome {
        case .queued:
            EmptyView()
        case .reading:
            ProgressView()
        case .read:
            Image(systemName: "checkmark.circle.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsSuccess)
        case .unreadable:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
        }
    }

    /// Cancel while it runs, and the way onward once it does not. The onward
    /// control never appears early: a batch half read is a batch whose review
    /// would be missing rows that are still coming.
    @ViewBuilder private var actions: some View {
        if finished {
            Button {
            } label: {
                Label(reviewTitle, systemImage: "checklist")
                    .font(.popsHeadline)
                    .padding(.horizontal, PopsSpacing.md)
                    .padding(.vertical, PopsSpacing.xs)
            }
            .playgroundProminentGlassButton()
            .padding(.bottom, PopsSpacing.lg)
        } else {
            Button("Cancel") {}
                .playgroundGlassButton()
                .padding(.bottom, PopsSpacing.lg)
        }
    }

    private var reviewTitle: String {
        readings.count == 1 ? "Check it" : "Check \(readings.count) purchases"
    }
}
