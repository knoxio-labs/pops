import AppCore
import Foundation

internal func tripVisitDurationLabel(_ duration: TripVisitDuration) -> String? {
    switch (duration.min, duration.max) {
    case (let minimum?, let maximum?):
        "\(minimum.formatted())–\(maximum.formatted()) \(duration.unit)"
    case (let minimum?, nil): "At least \(minimum.formatted()) \(duration.unit)"
    case (nil, let maximum?): "Up to \(maximum.formatted()) \(duration.unit)"
    case (nil, nil): nil
    }
}
