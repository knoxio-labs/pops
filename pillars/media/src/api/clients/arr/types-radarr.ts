/** Radarr API response and request types. */

export interface RadarrMovie {
  id: number;
  title: string;
  tmdbId: number;
  monitored: boolean;
  hasFile: boolean;
  /** Size of the movie file on disk in bytes (0 if no file). */
  sizeOnDisk?: number;
  /**
   * When the movie was added to Radarr. The pillar's own `movies.created_at`
   * cannot stand in for this: a bulk import wrote a near-constant value across
   * the library, which is what left the removal order sorting alphabetically
   * by rowid (POPS-2578).
   */
  added?: string;
  movieFile?: {
    /**
     * When Radarr recorded the file — the acquisition date the rotation
     * ranking ages a movie from, and equal to the file's birth time on disk
     * for every file on the live library.
     *
     * It is not merely a later {@link RadarrMovie.added}: the two disagree by
     * a median of 138 days and by as much as 672, because a movie added as a
     * wanted item is downloaded whenever a release appears. A bulk re-import
     * would flatten this into a single instant and was ruled out by measuring
     * it — 676 files land on 101 distinct days, at most 11 in any one hour.
     */
    dateAdded?: string;
  };
}

/** Disk space info returned by Radarr /diskspace endpoint. */
export interface RadarrDiskSpace {
  path: string;
  label: string;
  freeSpace: number;
  totalSpace: number;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface RadarrAddMovieInput {
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId: number;
  rootFolderPath: string;
}

export interface RadarrCheckResult {
  exists: boolean;
  radarrId?: number;
  monitored?: boolean;
}

export interface RadarrCommandResponse {
  id: number;
  name: string;
  status: string;
}

export interface RadarrQueueRecord {
  id: number;
  movieId: number;
  title: string;
  status: string;
  sizeleft: number;
  size: number;
}

export interface RadarrQueueResponse {
  totalRecords: number;
  records: RadarrQueueRecord[];
}
