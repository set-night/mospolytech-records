import type { ReleaseSection } from '@shared/types';

/** What changed in a version, as plain lists: release notes are never rendered as HTML. */
export function ReleaseNotes({ sections }: { sections: ReleaseSection[] }) {
  return (
    <div className="release-notes">
      {sections.map((section) => (
        <section key={section.title}>
          <h4>{section.title}</h4>
          <ul>
            {section.items.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
