import { useState, useCallback } from 'react';

interface UsePaginationOptions {
  defaultPage?: number;
  defaultPageSize?: number;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const { defaultPage = 1, defaultPageSize = 20 } = options;
  const [page, setPage] = useState(defaultPage);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);

  const handlePageChange = useCallback((newPage: number, newPageSize?: number) => {
    setPage(newPage);
    if (newPageSize) setPageSize(newPageSize);
  }, []);

  const reset = useCallback(() => {
    setPage(defaultPage);
    setPageSize(defaultPageSize);
  }, [defaultPage, defaultPageSize]);

  return {
    page,
    pageSize,
    total,
    setTotal,
    handlePageChange,
    reset,
    paginationParams: { page, page_size: pageSize },
  };
}
