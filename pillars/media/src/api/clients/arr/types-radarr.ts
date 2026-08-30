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
     * When Radarr recorded the file. Later than {@link RadarrMovie.added} for
     * every movie on the live library, and reset by a volume migration that
     * re-imports existing files — so it is not the acquisition date.
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
