import Testing

@testable import DesignSystem

/// What a note beside a field is, as a value.
///
/// Asserted rather than rasterised for the reason this package keeps saying:
/// a hint and a problem differ by a colour, and on a lane where the colour
/// catalogue did not compile they draw the same grey line. The claim worth
/// making — that the two are not the same thing — is one only a value
/// comparison can make everywhere.
@Suite("Field notes")
internal struct PopsFieldNoteTests {
    /// The distinction the correction surfaces rest on. An extractor being
    /// unsure about a value is a reason to look at it; drawing that in the
    /// same colour as "this cannot be saved" turns a prompt into an
    /// accusation, which is the framing those screens exist to avoid.
    @Test("a hint is not drawn as a failure")
    func hintIsNotAProblem() {
        #expect(PopsFieldNote.hint("look here").tone == .warning)
        #expect(PopsFieldNote.problem("cannot save").tone == .danger)
    }

    /// Borrowed from `PopsStatusHeader.Tone` rather than named again, so a
    /// hint under a field and a warning at the top of the screen it is on are
    /// the same colour by construction rather than by two people agreeing.
    @Test("both tones come from the status vocabulary")
    func tonesComeFromTheSharedVocabulary() {
        let tones = PopsStatusHeader.Tone.allCases

        #expect(tones.contains(PopsFieldNote.hint("").tone))
        #expect(tones.contains(PopsFieldNote.problem("").tone))
    }

    @Test("the text is carried through whichever case it is")
    func textSurvives() {
        #expect(PopsFieldNote.hint("smudged").text == "smudged")
        #expect(PopsFieldNote.problem("a total is needed").text == "a total is needed")
    }
}
