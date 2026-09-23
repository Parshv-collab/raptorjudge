import { useQuery } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { Loading } from "../components/ui";
export default function RoleHome(){const me=useQuery(api.users.me,{});if(!me)return <Loading/>;return <Navigate replace to={me.role==="admin"?"/admin":me.role==="organizer"?"/organizer":me.role==="judge"?"/judge":"/dashboard"}/>}
