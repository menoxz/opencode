# File update permissions

Release 1.19.20 fixes a regression in `AppFileSystem.writeWithDirs`: replacing
an existing inode with a freshly created temporary file could turn POSIX mode
0600 into 0644 and discard ownership/ACL protections.

Existing files are now opened for update and truncated/written on the same
descriptor. No replacement, chmod or chown occurs. This preserves the inode,
ownership, extended access-control lists, hardlinks and symlink target semantics.
Creation uses exclusive `wx` with permissions set before content is written;
the default is owner-only 0600. A supplied mode applies only to newly created
files, never to an existing file's ACL mask. Zero-length content still creates
or truncates the file without invoking the adapter's zero-byte write operation.

This deliberately sacrifices atomic replacement for existing-file edits:
interruption or concurrent writers can leave partial or interleaved content.
Portable rename APIs do not preserve all POSIX ACLs and Windows security
descriptors. Preserving protections takes precedence over atomicity here.
`writeJson` retains its separate existing behavior and Windows rename retries.

Evidence: filesystem regression tests on Windows and Linux, including a real
Linux extended ACL via `setfacl/getfacl`, inode/UID/GID, mode 0600/0640, hardlinks,
symlinks, Windows read-only files and empty content. Custom Windows DACLs are
not directly fixture-tested; no inode/security-descriptor replacement occurs.
