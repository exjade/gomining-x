export type PaginationItem = number | 'ellipsis'

export function getPaginationItems(pageCount: number, currentPage: number): PaginationItem[] {
  if (pageCount <= 0) return []
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1)

  const start = Math.max(2, currentPage >= pageCount - 1 ? pageCount - 2 : currentPage - 1)
  const end = Math.min(pageCount - 1, currentPage <= 2 ? 3 : currentPage + 1)
  const pages = [1, ...Array.from({ length: end - start + 1 }, (_, index) => start + index), pageCount]
  const result: PaginationItem[] = []
  let previous = 0
  for (const page of pages) {
    if (page - previous > 1) result.push('ellipsis')
    result.push(page)
    previous = page
  }
  return result
}
