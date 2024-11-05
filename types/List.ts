export interface List {
  id: number;
  name: string;
  users: ListUser;
}

export interface ListUser {
  email: string;
  name: string;
  avatar: string;
}
