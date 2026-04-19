export function generateSchoolCode(name: string): string {
  const prefix = name
    .replace(/[^A-Za-z]/g, "")
    .substring(0, 3)
    .toUpperCase()

  const random = Math.floor(1000 + Math.random() * 9000)

  return `${prefix}-${random}`
}