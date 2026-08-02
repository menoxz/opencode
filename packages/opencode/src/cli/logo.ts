export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: [
    "             ▄                ",
    "█▀▀▀ █▀▀█ █▀▀█ █▀▀█ █___█ ▀▀▀█",
    "█___ █__█ █__█ █^^^ ▀▄_▄▀ █▀▀▀",
    "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ _▀▄▀_ ▀▀▀▀",
  ],
}

const plain = (row: string) => row.replaceAll("_", " ").replaceAll("^", "▀").replaceAll("~", " ")

export const wordmark = logo.left.map((row, index) => plain(row) + " " + plain(logo.right[index] ?? ""))

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
