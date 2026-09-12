import AppCore
import DesignSystem
import SwiftUI

/// What is on screen while a model reads the paper.
///
/// The pages are the subject, large, with the progress over them — the same
/// rule the result screen already follows and for the same reason: a person
/// who has just handed over a photograph is waiting on *that* photograph, and
/// a spinner on an empty screen makes them wait on nothing.
///
/// It reads one receipt at a time even when several were staged, because one
/// receipt is one call. The count says which, so a stack of four does not look
/// like it has stalled on the first.
///
/// Nothing is written while this is on screen. That is the point of POPS-3646:
/// the call reads and returns, and the purchase is created when the form that
/// follows is saved. So there is no half-ingested state to explain if this is
/// cancelled, and Cancel is therefore an ordinary action rather than a
/// destructive one.
internal struct PurchaseReadingSurface: View {
    internal enum Progress: Hashable {
        case reading(done: Int, total: Int)
        /// The model could not make a reading out of this one. Not a failure
        /// of the call — the bytes arrived and were stored — so the way out is
        /// the form with nothing in it rather than a retry.
        case unreadable(page: String)
    }

    internal let pages: [StagedPage]
    internal let progress: Progress

    private let plateWidth: CGFloat = PopsSize.pageWidth * 1.6

    internal var body: some View {
        VStack(spacing: PopsSpacing.xl) {
            Spacer(minLength: PopsSpacing.zero)
            plates
            caption
            Spacer(minLength: PopsSpacing.zero)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(PopsSpacing.lg)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) { actions }
    }

    /// Fanned rather than stacked flat, so a three-page receipt is visibly
    /// three pages without needing a number to say so.
    private var plates: some View {
        ZStack {
            ForEach(Array(pages.prefix(3).enumerated()), id: \.element.id) { index, page in
                PopsPhoto(data: page.bytes, placeholderSymbol: "doc.richtext")
                    .frame(width: plateWidth, height: plateWidth * ratio)
                    .rotationEffect(.degrees(Double(index - 1) * 4))
                    .offset(x: CGFloat(index - 1) * PopsSpacing.md)
                    .opacity(index == 2 ? 1 : 0.85)
            }
        }
        .overlay(alignment: .center) { badge }
        .accessibilityHidden(true)
    }

    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth

    @ViewBuilder private var badge: some View {
        switch progress {
        case .reading:
            ProgressView()
                .controlSize(.large)
                .padding(PopsSpacing.lg)
                .playgroundGlass(in: Circle())
        case .unreadable:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.popsAmount)
                .foregroundStyle(Color.popsWarning)
                .padding(PopsSpacing.lg)
                .playgroundGlass(in: Circle())
        }
    }

    @ViewBuilder private var caption: some View {
        switch progress {
        case .reading(let done, let total):
            VStack(spacing: PopsSpacing.sm) {
                Text("Reading the receipt")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(
                    total == 1
                        ? "Nothing is saved until you confirm it."
                        : "Receipt \(done + 1) of \(total). Nothing is saved until you confirm it."
                )
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                .multilineTextAlignment(.center)
            }
        case .unreadable(let page):
            VStack(spacing: PopsSpacing.sm) {
                Text("This one could not be read")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(
                    "\(page) is stored, so nothing is lost. Fill it in yourself, or go back and "
                        + "photograph it again."
                )
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                .multilineTextAlignment(.center)
            }
        }
    }

    @ViewBuilder private var actions: some View {
        PopsActionBar {
            switch progress {
            case .reading:
                PopsButton("Cancel") {}
            case .unreadable:
                PopsButton("Fill it in myself", prominence: .prominent) {}
                PopsButton("Back") {}
            }
        }
    }
}
