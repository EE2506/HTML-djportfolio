CREATE TABLE IF NOT EXISTS project_samples (
    project_id INT UNSIGNED NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    image VARCHAR(80) NOT NULL,
    PRIMARY KEY (project_id, position),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
